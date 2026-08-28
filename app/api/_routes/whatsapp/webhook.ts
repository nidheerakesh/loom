import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { fnv1a, normalize } from "../../_lib/text.js";
import { toE164 } from "../../_lib/sms.js";
import { distanceMap } from "../../_lib/geo.js";
import { score, skillFit } from "../../_lib/scoring.js";

// Loom over WhatsApp.
//
// The app assumes a woman can install it, read a tab bar and navigate. Many of the women this
// is built for already do all their messaging in WhatsApp and nothing else — so this exposes
// the two things that matter, finding work and taking it, in the place she already is.
//
// Identity comes free. WhatsApp has already verified the sender's number, and accounts are
// keyed on `fnv1a("phone:" + e164)` — the same hash auth/request-otp computes — so a message
// resolves to a provider with no OTP, no password and no session. There is nothing to log
// into, which is the entire point.
//
// No language model. Replies are templates over the same deterministic engine the app uses,
// for the reason set out in docs/presentation/4-VIVA-QA.md: a hallucination here is somebody
// not getting paid. The bot understands a fixed vocabulary and says so when it doesn't.
//
// The listing is stateless on purpose. Ranking is deterministic, so "reply 1" recomputes the
// same order rather than remembering what was offered — no session table, no expiry.

const MAX_OFFERS = 3;

type Offer = { requestId: string; title: string; skill: string; distanceKm: number; pay: number | null };

function twiml(message: string): string {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

// "whatsapp:+919876530001" -> "+919876530001"
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
    .eq("phone_hash", fnv1a("phone:" + e164))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// The individual work feed, ranked exactly as matching/feed.ts ranks it — same scoring
// helpers, same order. Deliberately its own query rather than a shared extraction: this
// route was added the night before a demo and must not be able to break the screen the
// demo depends on. Worth collapsing into one function afterwards.
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

function listing(name: string, offers: Offer[]): string {
  if (offers.length === 0) {
    return `${name}, ഇപ്പോൾ പുതിയ ജോലി ഇല്ല.\nNo open work matching your skills right now. We'll message you when there is.`;
  }
  const lines = offers.map(
    (o, i) =>
      `${i + 1}. ${o.title}\n   ${o.skill} · ${o.distanceKm} കി.മീ${o.pay ? ` · ₹${o.pay}` : ""}`,
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
  "",
  "Reply 1, 2 or 3 after a list to apply.",
].join("\n");

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("content-type", "text/xml; charset=utf-8");

  // Twilio posts form-encoded. Never 500 at Twilio — an error status makes it retry and the
  // sender sees nothing, so failures are reported as a message instead.
  try {
    const body = (req.body ?? {}) as Record<string, string>;
    const from = typeof body.From === "string" ? body.From : "";
    const text = normalize(typeof body.Body === "string" ? body.Body : "");

    const e164 = senderNumber(from);
    if (!e164) {
      res.status(200).send(twiml("Could not read your number. Message us from WhatsApp."));
      return;
    }

    const provider = await providerFor(e164);
    if (!provider) {
      res.status(200).send(
        twiml(
          [
            "ഈ നമ്പർ ലൂമിൽ രജിസ്റ്റർ ചെയ്തിട്ടില്ല.",
            "",
            "This number isn't registered as a provider yet.",
            "Sign up once at loom-lovat-phi.vercel.app, then message here — no password needed.",
          ].join("\n"),
        ),
      );
      return;
    }

    const first = provider.name.split(" ")[0];

    // A bare number applies to that position in the last listing, recomputed.
    const pick = /^[1-9]$/.test(text) ? Number(text) : null;
    if (pick !== null) {
      const offers = await offersFor(provider);
      const chosen = offers[pick - 1];
      if (!chosen) {
        res.status(200).send(twiml(`There is no job ${pick} right now.\n\n${listing(first, offers)}`));
        return;
      }

      const { data: existing } = await supabaseAdmin
        .from("interests")
        .select("id, state")
        .eq("provider_id", provider.id)
        .eq("request_id", chosen.requestId)
        .maybeSingle();

      if (existing?.state === "interested") {
        res.status(200).send(twiml(`You have already applied for "${chosen.title}". Waiting for the customer.`));
        return;
      }
      if (existing) {
        await supabaseAdmin.from("interests").update({ state: "interested" }).eq("id", existing.id);
      } else {
        await supabaseAdmin
          .from("interests")
          .insert({ provider_id: provider.id, request_id: chosen.requestId, state: "interested" });
      }

      res.status(200).send(
        twiml(
          [
            `✓ "${chosen.title}" — അപേക്ഷിച്ചു.`,
            "",
            "Applied. This registers interest — the customer chooses who gets the work, and we'll message you either way.",
          ].join("\n"),
        ),
      );
      return;
    }

    // `\b` is defined against Latin word characters, so `\bജോലി\b` can never match and the
    // Malayalam command silently fell through to the menu — the flagship claim of a
    // Malayalam-first product failing in Malayalam. Latin words keep their boundaries so
    // "network" doesn't read as "work"; Malayalam is matched by substring.
    const wantsMine = /\b(my|status)\b/.test(text) || text.includes("എന്റെ");
    const wantsWork = /\b(work|job|jobs)\b/.test(text) || text.includes("ജോലി");

    if (wantsWork && !wantsMine) {
      res.status(200).send(twiml(listing(first, await offersFor(provider))));
      return;
    }

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
        res.status(200).send(twiml("You have not applied for any work yet. Send WORK to see what's near you."));
        return;
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
      res.status(200).send(twiml(["എന്റെ ജോലി / My work:", "", ...lines].join("\n")));
      return;
    }

    res.status(200).send(twiml(MENU));
  } catch (e) {
    console.error("[whatsapp] ", e);
    res.status(200).send(twiml("Something went wrong at our end. Please try again in a moment."));
  }
}
