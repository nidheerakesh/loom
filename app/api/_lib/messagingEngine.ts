import { supabaseAdmin } from "./supabase.js";
import { hashPhone, legacyPhoneHash, normalize } from "./text.js";
import { distanceMap } from "./geo.js";
import { score, skillFit } from "./scoring.js";

// The channel-agnostic half of chat-over-messaging-app. Originally lived inside
// whatsapp/webhook.ts; split out once a second channel (Telegram, for the demo — Meta's review
// queue is slow and can cost money, so the real deployment stays WhatsApp and this is what
// judges actually poke at) needed the exact same commands. `replyFor` takes a phone number and
// whatever text a person typed or said, and returns what to say back — it has never known
// which network delivered the message, and still doesn't.

const MAX_OFFERS = 3;

export type Offer = { requestId: string; title: string; skill: string; distanceKm: number; pay: number | null };
export type Invite = { teamId: string; title: string; skill: string; units: number };

export async function providerFor(e164: string) {
  const { data, error } = await supabaseAdmin
    .from("providers")
    .select("id, name, home_location_id")
    .eq("phone_hash", hashPhone(e164))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;

  // A row written before the move to HMAC hashing is still keyed on the old fnv1a value. The
  // sign-in path migrates those rows as it finds them; this one only reads, because a webhook
  // must stay side-effect-free with respect to identity — she has not proved anything here
  // beyond the channel's own verification of the sender.
  const { data: legacy, error: legacyError } = await supabaseAdmin
    .from("providers")
    .select("id, name, home_location_id")
    .eq("phone_hash", legacyPhoneHash(e164))
    .maybeSingle();
  if (legacyError) throw new Error(legacyError.message);
  return legacy;
}

// The individual work feed, ranked exactly as matching/feed.ts ranks it. Deliberately its own
// query rather than a shared extraction: this route was added the night before a demo and must
// not be able to break the screen the demo depends on. Worth collapsing afterwards.
export async function offersFor(provider: { id: string; home_location_id: string }): Promise<Offer[]> {
  const { data: mySkills } = await supabaseAdmin
    .from("provider_skills")
    .select("skill_id, proficiency")
    .eq("provider_id", provider.id);
  const profBySkill = new Map((mySkills ?? []).map((r) => [r.skill_id, r.proficiency] as const));
  if (profBySkill.size === 0) return [];

  const { data: reqSkillRows } = await supabaseAdmin
    .from("request_skills")
    .select("request_id, skill_id")
    .in("skill_id", [...profBySkill.keys()]);
  const candidateIds = [...new Set((reqSkillRows ?? []).map((r) => r.request_id))];
  if (candidateIds.length === 0) return [];

  const { data: requests } = await supabaseAdmin
    .from("requests")
    .select("id, title, pay, location_id")
    .in("id", candidateIds)
    .eq("status", "open")
    .eq("mode", "individual"); // group orders are staffed by team assembly, never by interest
  if (!requests || requests.length === 0) return [];

  const [{ data: skillRows }, distances] = await Promise.all([
    supabaseAdmin
      .from("skills")
      .select("id, canonical_name, canonical_name_ml")
      .in("id", [...profBySkill.keys()]),
    distanceMap(
      provider.home_location_id,
      requests.map((r) => r.location_id),
    ),
  ]);
  const skillById = new Map((skillRows ?? []).map((s) => [s.id, s] as const));
  const skillsOfRequest = new Map<string, string[]>();
  for (const rs of reqSkillRows ?? []) {
    const list = skillsOfRequest.get(rs.request_id) ?? [];
    list.push(rs.skill_id);
    skillsOfRequest.set(rs.request_id, list);
  }

  const ranked = [];
  for (const r of requests) {
    let bestProf = 0;
    let matched: string | null = null;
    for (const skillId of skillsOfRequest.get(r.id) ?? []) {
      const prof = profBySkill.get(skillId);
      if (prof !== undefined && prof > bestProf) {
        bestProf = prof;
        matched = skillId;
      }
    }
    if (!matched) continue;
    const dist = distances.get(r.location_id) ?? Number.POSITIVE_INFINITY;
    ranked.push({
      requestId: r.id,
      title: r.title,
      skill: skillById.get(matched)?.canonical_name_ml ?? skillById.get(matched)?.canonical_name ?? "",
      distanceKm: Math.round(dist * 10) / 10,
      pay: r.pay,
      total: score(skillFit(bestProf), dist, r.pay ?? undefined).total,
    });
  }
  ranked.sort((a, b) => b.total - a.total || a.requestId.localeCompare(b.requestId));
  return ranked.slice(0, MAX_OFFERS);
}

// Team invitations she has not answered yet.
//
// Mirrors my-teams.ts exactly, including the rule that matters: a team the customer has not
// confirmed is still a draft and must not be shown, or a woman could accept a slot on work
// nobody has committed to.
export async function invitesFor(providerId: string): Promise<Invite[]> {
  const { data } = await supabaseAdmin
    .from("team_members")
    .select("team_id, covered_units, state, skills(canonical_name, canonical_name_ml), teams(id, status, requests(title, status))")
    .eq("provider_id", providerId)
    .eq("state", "invited");

  type Row = {
    team_id: string;
    covered_units: number;
    skills: { canonical_name: string; canonical_name_ml: string | null } | null;
    teams: { id: string; status: string; requests: { title: string; status: string } | null } | null;
  };

  const out: Invite[] = [];
  for (const m of (data ?? []) as unknown as Row[]) {
    if (m.teams?.status !== "confirmed") continue;
    if (m.teams.requests?.status === "completed") continue;
    out.push({
      teamId: m.teams.id,
      title: m.teams.requests?.title ?? "",
      skill: m.skills?.canonical_name_ml ?? m.skills?.canonical_name ?? "",
      units: m.covered_units,
    });
  }
  out.sort((a, b) => a.teamId.localeCompare(b.teamId));
  return out;
}

function inviteList(name: string, invites: Invite[]): string {
  if (invites.length === 0) {
    return `${name}, ഇപ്പോൾ ടീം ക്ഷണങ്ങളൊന്നുമില്ല.\nNo team invitations waiting.`;
  }
  const lines = invites.map(
    (v, i) => `${i + 1}. ${v.title}\n   ${v.skill} · ${v.units} എണ്ണം`,
  );
  return [
    `${name}, ${invites.length} ടീം ക്ഷണം / ${invites.length} team invitation${invites.length > 1 ? "s" : ""}:`,
    "",
    ...lines,
    "",
    "സ്വീകരിക്കാൻ: അതെ 1 — to accept, send: YES 1",
    "വേണ്ടെങ്കിൽ: വേണ്ട 1 — to decline, send: NO 1",
  ].join("\n");
}

function listing(name: string, offers: Offer[]): string {
  if (offers.length === 0) {
    return `${name}, ഇപ്പോൾ പുതിയ ജോലി ഇല്ല.\nNo open work matching your skills right now. We'll message you when there is.`;
  }
  const lines = offers.map(
    (o, i) => `${i + 1}. ${o.title}\n   ${o.skill} · ${o.distanceKm} കി.മീ${o.pay ? ` · ₹${o.pay}` : ""}`,
  );
  return [
    `${name}, ${offers.length} ജോലി കണ്ടെത്തി / ${offers.length} job${offers.length > 1 ? "s" : ""} found:`,
    "",
    ...lines,
    "",
    "സ്വീകരിക്കാൻ നമ്പർ അയയ്ക്കുക — reply with the number to apply (e.g. 1)",
  ].join("\n");
}

export const MENU = [
  "ലൂം / Loom",
  "",
  "ജോലി — send WORK to see jobs near you",
  "എന്റെ ജോലി — send MY WORK for what you applied to",
  "ടീം — send TEAM for team invitations",
  "",
  "Reply 1, 2 or 3 after a list to apply.",
].join("\n");

export const CANNOT_HEAR = [
  "ഇപ്പോൾ ശബ്ദ സന്ദേശം കേൾക്കാൻ കഴിയില്ല.",
  "",
  "Voice messages aren't working yet — please type instead.",
  "ജോലി — for work · ടീം — for team invitations",
].join("\n");

export const NOT_REGISTERED = [
  "ഈ നമ്പർ ലൂമിൽ രജിസ്റ്റർ ചെയ്തിട്ടില്ല.",
  "",
  "This number isn't registered as a provider yet.",
  "Sign up once at loom-lovat-phi.vercel.app, then message here — no password needed.",
].join("\n");

type Provider = { id: string; name: string; home_location_id: string };

// A Telegram chat that has already proved its phone number (telegram_links) has only a
// phone_hash to work with, not the e164 providerFor needs for its legacy-hash fallback — by
// the time a link row exists, the account was already migrated off the old hash (a fresh
// signup is never on it, and telegram_links can only be created after a successful providerFor
// lookup in the first place). So this skips straight to the current-format hash, no fallback.
export async function providerForHash(phoneHash: string): Promise<Provider | null> {
  const { data, error } = await supabaseAdmin
    .from("providers")
    .select("id, name, home_location_id")
    .eq("phone_hash", phoneHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// The actual command logic, once a provider has been resolved one way or another. Knows
// nothing about which network delivered the message or how identity was proven.
async function replyForProvider(provider: Provider | null, raw: string): Promise<string> {
  const text = normalize(raw);
  if (!provider) return NOT_REGISTERED;

  const first = provider.name.split(" ")[0];

  const pick = /^[1-9]$/.test(text) ? Number(text) : null;
  if (pick !== null) {
    const offers = await offersFor(provider);
    const chosen = offers[pick - 1];
    if (!chosen) return `There is no job ${pick} right now.\n\n${listing(first, offers)}`;

    const { data: existing } = await supabaseAdmin
      .from("interests")
      .select("id, state")
      .eq("provider_id", provider.id)
      .eq("request_id", chosen.requestId)
      .maybeSingle();

    if (existing?.state === "interested") {
      return `You have already applied for "${chosen.title}". Waiting for the customer.`;
    }
    if (existing) {
      await supabaseAdmin.from("interests").update({ state: "interested" }).eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("interests")
        .insert({ provider_id: provider.id, request_id: chosen.requestId, state: "interested" });
    }
    return [
      `✓ "${chosen.title}" — അപേക്ഷിച്ചു.`,
      "",
      "Applied. This registers interest — the customer chooses who gets the work, and we'll message you either way.",
    ].join("\n");
  }

  const answer = /^(അതെ|yes|y|വേണ്ട|no|n)\s*([1-9])?$/.exec(text);
  if (answer) {
    const accept = /^(അതെ|yes|y)$/.test(answer[1]);
    const invites = await invitesFor(provider.id);
    if (invites.length === 0) return `ഇപ്പോൾ ടീം ക്ഷണങ്ങളൊന്നുമില്ല.\nNothing to answer right now.`;
    const idx = answer[2] ? Number(answer[2]) - 1 : invites.length === 1 ? 0 : -1;
    const chosen = invites[idx];
    if (!chosen) {
      return `${answer[2] ? `There is no invitation ${answer[2]}.` : "Which one?"}\n\n${inviteList(first, invites)}`;
    }

    const { error } = await supabaseAdmin
      .from("team_members")
      .update({ state: accept ? "accepted" : "declined" })
      .eq("team_id", chosen.teamId)
      .eq("provider_id", provider.id);
    if (error) throw new Error(error.message);

    return accept
      ? [`✓ "${chosen.title}" — സ്വീകരിച്ചു.`, "", `You're on the team for ${chosen.units} ${chosen.skill}. The customer can no longer replace you.`].join("\n")
      : [`"${chosen.title}" — വേണ്ടെന്ന് അറിയിച്ചു.`, "", "Declined. The customer can fill your place with someone else."].join("\n");
  }

  if (/\b(team|teams)\b/.test(text) || text.includes("ടീം")) {
    return inviteList(first, await invitesFor(provider.id));
  }

  const wantsMine = /\b(my|status)\b/.test(text) || text.includes("എന്റെ");
  const wantsWork = /\b(work|job|jobs)\b/.test(text) || text.includes("ജോലി");

  if (wantsWork && !wantsMine) return listing(first, await offersFor(provider));

  if (wantsMine) {
    const { data: mine } = await supabaseAdmin
      .from("interests")
      .select("state, requests(title, status)")
      .eq("provider_id", provider.id)
      .order("created_at", { ascending: false })
      .limit(5);
    const rows = (mine ?? []) as unknown as {
      state: string;
      requests: { title: string; status: string } | null;
    }[];
    if (rows.length === 0) {
      return "You have not applied for any work yet. Send WORK to see what's near you.";
    }
    const lines = rows.map((r) => {
      const label =
        r.state === "accepted"
          ? "✓ yours"
          : r.requests?.status === "completed"
            ? "finished"
            : r.state === "declined"
              ? "not selected"
              : "waiting for the customer";
      return `• ${r.requests?.title ?? "—"} — ${label}`;
    });
    return ["എന്റെ ജോലി / My work:", "", ...lines].join("\n");
  }

  return MENU;
}

// WhatsApp's identity is free (Meta/Twilio already verified the sender), so it always has a
// real e164 to hand in.
export async function replyFor(e164: string, raw: string): Promise<string> {
  return replyForProvider(await providerFor(e164), raw);
}

// Telegram's identity is a chat that already linked its phone_hash (telegram/webhook.ts) —
// no e164 to re-derive it from.
export async function replyForPhoneHash(phoneHash: string, raw: string): Promise<string> {
  return replyForProvider(await providerForHash(phoneHash), raw);
}
