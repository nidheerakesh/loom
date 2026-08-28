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
// the two things that matter, finding work and taking it, where she already is.
//
// Identity comes free. WhatsApp has already verified the sender's number, and accounts are
// keyed on `fnv1a("phone:" + e164)` — the same hash auth/request-otp computes — so a message
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
    .eq("phone_hash", fnv1a("phone:" + e164))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
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
  "",
  "Reply 1, 2 or 3 after a list to apply.",
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
      if (msg?.type === "text" && typeof msg.from === "string") {
        const e164 = senderNumber(msg.from);
        if (e164) await sendViaMeta(msg.from, await replyFor(e164, String(msg.text?.body ?? "")));
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
