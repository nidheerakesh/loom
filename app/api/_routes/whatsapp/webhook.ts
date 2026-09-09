import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { hashPhone, legacyPhoneHash, normalize } from "../../_lib/text.js";
import { toE164 } from "../../_lib/sms.js";
import { distanceMap } from "../../_lib/geo.js";
import { score, skillFit } from "../../_lib/scoring.js";
import { transcribe, sttConfigured } from "../../_lib/speech.js";

// Loom over WhatsApp.
//
// The app assumes a woman can install it, read a tab bar and navigate. Many of the women this
// is built for already do all their messaging in WhatsApp and nothing else — so this exposes
// the two things that matter, finding work and taking it, where she already is.
//
// Identity comes free. WhatsApp has already verified the sender's number, and accounts are
// keyed on `hashPhone(e164)` — the same hash auth/request-otp computes — so a message
// resolves to a provider with no OTP, no password and no session.
//
// Two networks, one engine. Meta's Cloud API and Twilio deliver completely different payloads
// and expect replies by different means, so each gets a thin adapter and `replyFor` below
// knows about neither. Adding a third channel is another adapter, not another product.
//
// No language model: replies are templates over the same deterministic engine the app uses,
// because a hallucination here means somebody does not get paid.

const MAX_OFFERS = 3;
const GRAPH = "https://graph.facebook.com/v21.0";

type Offer = { requestId: string; title: string; skill: string; distanceKm: number; pay: number | null };

function twiml(message: string): string {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

// Twilio sends "whatsapp:+919876530001"; Meta sends a bare "919876530001". toE164 normalises
// both to the +91 form the account hash is built from.
function senderNumber(from: string): string | null {
  const raw = from.replace(/^whatsapp:/i, "").trim();
  try {
    return toE164(raw);
  } catch {
    return null;
  }
}

async function providerFor(e164: string) {
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
  // beyond WhatsApp's own verification of the sender.
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
async function offersFor(provider: { id: string; home_location_id: string }): Promise<Offer[]> {
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


type Invite = { teamId: string; title: string; skill: string; units: number };

// Team invitations she has not answered yet.
//
// Mirrors my-teams.ts exactly, including the rule that matters: a team the customer has not
// confirmed is still a draft and must not be shown, or a woman could accept a slot on work
// nobody has committed to. The collective half of the product was invisible here until now —
// she had to open the app to answer, which is the wall this channel exists to remove.
async function invitesFor(providerId: string): Promise<Invite[]> {
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
  // Same tiebreak discipline as everywhere else: a stable order, so "yes 2" means the same
  // thing between two messages without anything being remembered.
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

const MENU = [
  "ലൂം / Loom",
  "",
  "ജോലി — send WORK to see jobs near you",
  "എന്റെ ജോലി — send MY WORK for what you applied to",
  "ടീം — send TEAM for team invitations",
  "",
  "Reply 1, 2 or 3 after a list to apply.",
].join("\n");


// A voice note is how a woman who does not type actually communicates, so the channel that
// exists to remove the app is not much use if it only accepts text. WhatsApp sends audio as a
// media id, which has to be exchanged for a short-lived URL and then downloaded with the same
// token.
async function transcribeVoiceNote(mediaId: string): Promise<string | null> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token || !sttConfigured()) return null;

  try {
    const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      console.error(`[whatsapp] media lookup ${metaRes.status}`);
      return null;
    }
    const meta = await metaRes.json();
    if (typeof meta?.url !== "string") return null;

    // The media URL is on a Meta CDN and still requires the token — fetching it unauthenticated
    // returns a 401 that looks like an expired media id.
    const audioRes = await fetch(meta.url, { headers: { authorization: `Bearer ${token}` } });
    if (!audioRes.ok) {
      console.error(`[whatsapp] media download ${audioRes.status}`);
      return null;
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const result = await transcribe(buf, typeof meta.mime_type === "string" ? meta.mime_type : "audio/ogg");
    return result?.text ?? null;
  } catch (e) {
    console.error("[whatsapp] voice note ", e);
    return null;
  }
}

const CANNOT_HEAR = [
  "ഇപ്പോൾ ശബ്ദ സന്ദേശം കേൾക്കാൻ കഴിയില്ല.",
  "",
  "Voice messages aren't working yet — please type instead.",
  "ജോലി — for work · ടീം — for team invitations",
].join("\n");

// What to say back. Knows nothing about which network delivered the message.
async function replyFor(e164: string, raw: string): Promise<string> {
  const text = normalize(raw);
  const provider = await providerFor(e164);
  if (!provider) {
    return [
      "ഈ നമ്പർ ലൂമിൽ രജിസ്റ്റർ ചെയ്തിട്ടില്ല.",
      "",
      "This number isn't registered as a provider yet.",
      "Sign up once at loom-lovat-phi.vercel.app, then message here — no password needed.",
    ].join("\n");
  }

  const first = provider.name.split(" ")[0];

  // A bare number applies to that position in the last listing, recomputed. Ranking is
  // deterministic, so there is nothing to remember between messages.
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

  // Answering a team invitation. Checked before the work commands because "അതെ 1" contains a
  // bare number, and before the bare-number branch because that means something else entirely.
  const answer = /^(അതെ|yes|y|വേണ്ട|no|n)\s*([1-9])?$/.exec(text);
  if (answer) {
    const accept = /^(അതെ|yes|y)$/.test(answer[1]);
    const invites = await invitesFor(provider.id);
    if (invites.length === 0) return `ഇപ്പോൾ ടീം ക്ഷണങ്ങളൊന്നുമില്ല.\nNothing to answer right now.`;
    // With one invitation waiting, a bare "yes" is unambiguous and asking for a number is
    // pedantry. With several it is a coin toss, so refuse and re-list.
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

  // `\b` is defined against Latin word characters, so `\bജോലി\b` can never match. Latin words
  // keep their boundaries so "network" is not read as "work"; Malayalam matches by substring.
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

// Meta replies out-of-band: the webhook answers 200 immediately and the message is a separate
// API call, unlike Twilio where the reply is the HTTP response body.
async function sendViaMeta(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error("[whatsapp] WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set");
    return;
  }
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  if (!res.ok) console.error(`[whatsapp] send ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Meta verifies ownership of the webhook by calling it with a challenge to echo back.
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(String(challenge ?? ""));
      return;
    }
    res.status(403).send("Verification failed");
    return;
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // --- Meta Cloud API ---------------------------------------------------------------
    if (Array.isArray(body.entry)) {
      const value = body.entry[0]?.changes?.[0]?.value;
      const msg = value?.messages?.[0];
      // Delivery receipts and read receipts arrive here too and must be acknowledged silently.
      if (typeof msg?.from === "string" && (msg.type === "text" || msg.type === "audio")) {
        const e164 = senderNumber(msg.from);
        if (e164) {
          const said: string | null =
            msg.type === "text" ? String(msg.text?.body ?? "") : await transcribeVoiceNote(String(msg.audio?.id ?? ""));

          // Transcription that failed must not be treated as an empty message, which would
          // silently answer with the menu and leave her thinking she was understood.
          if (msg.type === "audio" && !said) {
            await sendViaMeta(msg.from, CANNOT_HEAR);
          } else {
            const reply = await replyFor(e164, said ?? "");
            // Reading back what we heard is not politeness — it is the only way she can catch a
            // mistranscription before it becomes an application for the wrong job.
            await sendViaMeta(
              msg.from,
              msg.type === "audio" ? `🎤 "${said}"\n\n${reply}` : reply,
            );
          }
        }
      }
      res.status(200).send("ok");
      return;
    }

    // --- Twilio -----------------------------------------------------------------------
    res.setHeader("content-type", "text/xml; charset=utf-8");
    const from = typeof body.From === "string" ? body.From : "";
    const e164 = senderNumber(from);
    if (!e164) {
      res.status(200).send(twiml("Could not read your number. Message us from WhatsApp."));
      return;
    }
    res.status(200).send(twiml(await replyFor(e164, String(body.Body ?? ""))));
  } catch (e) {
    console.error("[whatsapp] ", e);
    // Never fail at the provider — an error status makes it retry and the sender sees nothing.
    if (Array.isArray(req.body?.entry)) res.status(200).send("ok");
    else res.status(200).send(twiml("Something went wrong at our end. Please try again in a moment."));
  }
}
