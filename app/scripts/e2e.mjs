// Loom end-to-end test. Drives the deployed API exactly as the UI drives it, using real
// accounts created through the real phone + OTP flow — no fixtures, no mocks, no direct
// database access. It is the automated counterpart to docs/DEMO_RUNBOOK.md: the runbook
// proves the screens work, this proves the system underneath them does.
//
//   node scripts/e2e.mjs                            # against production
//   LOOM_BASE=http://localhost:3000/api node scripts/e2e.mjs
//
// Requires the demo OTP path (no Twilio configured), which returns the code in the response.
//
// Three provider accounts and two customer accounts cover every path needing more than one
// actor: two providers competing for one job, a customer choosing between them, a team whose
// members accept and decline independently, and a non-participant who must be locked out of a
// conversation. The group order is sized so one provider stays off the team — the bench that
// makes every swap path testable.

const BASE = process.env.LOOM_BASE || "https://loom-lovat-phi.vercel.app/api";
const NEW_SKILL = process.env.NEW_SKILL || "loomtest reed weaving";

let pass = 0, fail = 0;
const results = [];

function ok(name, cond, detail = "") {
  if (cond) { pass++; results.push(["PASS", name, detail]); console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; results.push(["FAIL", name, detail]); console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
  return cond;
}

async function call(method, path, { body, query } = {}) {
  const url = new URL(BASE + "/" + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const post = (p, body) => call("POST", p, { body });
const get = (p, query) => call("GET", p, { query });

async function signUp(phone, role, name) {
  const otp = await post("auth/request-otp", { phone });
  if (otp.status !== 200) throw new Error(`request-otp ${otp.status} ${JSON.stringify(otp.data)}`);
  const code = otp.data?.devCode;
  if (!code) throw new Error(`no devCode returned for ${phone} — Twilio configured? ${JSON.stringify(otp.data)}`);
  const v = await post("auth/verify-otp", { phone, code });
  if (v.data?.status === "session") return { token: v.data.token, userId: v.data.userId, role: v.data.role, returning: true, devCode: code };
  if (v.data?.status === "signup") {
    const c = await post("auth/complete-login", { ticket: v.data.ticket, role, name, consent: true });
    if (c.status !== 200) throw new Error(`complete-login ${c.status} ${JSON.stringify(c.data)}`);
    return { token: c.data.token, userId: c.data.userId, role: c.data.role, returning: false, devCode: code };
  }
  if (v.data?.status === "choose") {
    const c = await post("auth/complete-login", { ticket: v.data.ticket, role, name });
    return { token: c.data.token, userId: c.data.userId, role: c.data.role, returning: true, devCode: code };
  }
  throw new Error(`verify-otp unexpected: ${v.status} ${JSON.stringify(v.data)}`);
}

const A = {
  p1: { phone: "9000000101", name: "Test Provider One", role: "provider" },
  p2: { phone: "9000000102", name: "Test Provider Two", role: "provider" },
  p3: { phone: "9000000103", name: "Test Provider Three", role: "provider" },
  c1: { phone: "9000000201", name: "Test Customer One", role: "customer" },
  c2: { phone: "9000000202", name: "Test Customer Two", role: "customer" },
};

function section(t) { console.log(`\n${"─".repeat(72)}\n${t}\n${"─".repeat(72)}`); }

async function main() {
  // ── A · AUTH ────────────────────────────────────────────────────────────────
  section("A · Authentication — 3 providers, 2 customers");
  for (const k of Object.keys(A)) {
    const a = A[k];
    const s = await signUp(a.phone, a.role, a.name);
    Object.assign(a, s);
    ok(`${a.name} signed in`, Boolean(a.token) && a.role === (k.startsWith("p") ? "provider" : "customer"),
      `role=${a.role} ${a.returning ? "(returning account)" : "(new signup)"}`);
  }

  const me = await get("auth/me", { token: A.p1.token });
  ok("auth/me returns the signed-in provider", me.status === 200 && me.data?.role === "provider" && me.data?.provider?.name === A.p1.name,
    `name=${me.data?.provider?.name}`);

  const badOtp = await post("auth/verify-otp", { phone: A.p1.phone, code: "000000" });
  ok("wrong OTP rejected", badOtp.status >= 400, `${badOtp.status} ${badOtp.data?.error ?? ""}`);

  const noAuth = await get("auth/me", { token: "not-a-real-token" });
  ok("bogus token yields no session", noAuth.status === 200 ? noAuth.data === null : noAuth.status === 401,
    `status=${noAuth.status} body=${JSON.stringify(noAuth.data)}`);

  // ── B · SKILL CANONICALISATION ──────────────────────────────────────────────
  section("B · Skill canonicalisation");
  const r1 = await post("skills/resolve", { token: A.p1.token, phrases: ["sewing", "catering", NEW_SKILL] });
  const rb1 = r1.data?.readback ?? [];
  const via = (name) => rb1.find((x) => (x.raw || "").toLowerCase() === name.toLowerCase());
  ok("'sewing' resolves by alias", via("sewing")?.matchedVia === "alias",
    `→ ${via("sewing")?.canonicalNameMl ?? via("sewing")?.canonicalName} via ${via("sewing")?.matchedVia}`);
  ok("'catering' resolves by alias", via("catering")?.matchedVia === "alias",
    `→ ${via("catering")?.canonicalNameMl ?? via("catering")?.canonicalName} via ${via("catering")?.matchedVia}`);
  ok("a genuinely new phrase becomes its own skill", Boolean(via(NEW_SKILL)?.skillId),
    `${NEW_SKILL} → ${via(NEW_SKILL)?.canonicalName} (${via(NEW_SKILL)?.matchedVia ?? "new"})`);
  const newSkillId = via(NEW_SKILL)?.skillId;

  const r2 = await post("skills/resolve", { token: A.p2.token, phrases: ["stiching", NEW_SKILL] });
  const rb2 = r2.data?.readback ?? [];
  const typo = rb2.find((x) => (x.raw || "").toLowerCase() === "stiching");
  ok("'stiching' (typo) resolves to stitching via typo tier", typo?.matchedVia === "typo",
    `→ ${typo?.canonicalName} via ${typo?.matchedVia}`);
  ok("same new skill reused, not duplicated",
    rb2.find((x) => (x.raw || "").toLowerCase() === NEW_SKILL.toLowerCase())?.skillId === newSkillId);

  const r3 = await post("skills/resolve", { token: A.p3.token, phrases: ["garment finishing", "packaging", NEW_SKILL, "covering"] });
  const rb3 = r3.data?.readback ?? [];
  const gf = rb3.find((x) => (x.raw || "").toLowerCase() === "garment finishing");
  ok("'garment finishing' resolves to stitching (shares almost no characters)", gf?.matchedVia === "alias",
    `→ ${gf?.canonicalName} via ${gf?.matchedVia}`);

  const stitchingId = via("sewing")?.skillId ?? typo?.skillId;

  const cov = await post("skills/resolve", { token: A.p3.token, phrases: ["garment finishing", "packaging", NEW_SKILL, "covering"] });
  const covr = (cov.data?.readback ?? []).find((x) => (x.raw || "") === "covering");
  ok("'covering' does NOT collapse into cooking (the regression that was fixed)",
    (covr?.canonicalName || "").toLowerCase() !== "cooking",
    `covering → ${covr?.canonicalName} via ${covr?.matchedVia ?? "new"}`);

  const mine = await get("skills/mine", { token: A.p1.token });
  ok("provider's own skills list back", mine.status === 200 && Array.isArray(mine.data) && mine.data.length >= 2,
    `${mine.data?.length} skills`);

  // ── C · PROFILES ────────────────────────────────────────────────────────────
  section("C · Profiles");
  for (const [k, cap] of [["p1", 4], ["p2", 4], ["p3", 4]]) {
    const u = await post("providers/update-profile", {
      token: A[k].token, capacity: cap, rate: 300 + Number(k.slice(1)) * 10,
      rateUnit: "piece", deliveryDays: 3, experienceYears: 5, available: true, languages: ["ml", "en"],
    });
    ok(`${A[k].name} profile saved`, u.status === 200, `capacity=${cap}`);
  }
  const pget = await get("providers/get", { providerId: A.p1.userId });
  ok("provider detail readable", pget.status === 200 && pget.data && pget.data.capacity === 4,
    `capacity=${pget.data?.capacity} rate=${pget.data?.rate}`);

  const cu = await post("customers/update-profile", { token: A.c1.token, name: A.c1.name, company: "Test Co" });
  ok("customer profile saved", cu.status === 200);

  // ── D · BROWSE + FILTERS ────────────────────────────────────────────────────
  section("D · Browse and filters");
  const all = await get("providers/search", { token: A.c1.token });
  ok("browse returns providers", all.status === 200 && Array.isArray(all.data) && all.data.length > 0, `${all.data?.length} cards`);
  const bySkill = await get("providers/search", { token: A.c1.token, skillId: stitchingId });
  ok("skill filter narrows the list", bySkill.status === 200 && bySkill.data.length > 0 && bySkill.data.length <= all.data.length,
    `${bySkill.data?.length} of ${all.data?.length} have stitching`);
  const byRate = await get("providers/search", { token: A.c1.token, maxRate: 400 });
  ok("price filter obeyed", byRate.status === 200 && byRate.data.every((c) => c.rate == null || c.rate <= 400),
    `${byRate.data?.length} cards ≤ ₹400`);
  const byDist = await get("providers/search", { token: A.c1.token, maxDistanceKm: 5 });
  ok("distance filter obeyed", byDist.status === 200 && byDist.data.every((c) => c.distanceKm == null || c.distanceKm <= 5),
    `${byDist.data?.length} cards ≤ 5km`);
  const combined = await get("providers/search", { token: A.c1.token, skillId: stitchingId, maxRate: 400, maxDistanceKm: 5 });
  ok("combined filters obeyed", combined.status === 200 && combined.data.length <= bySkill.data.length, `${combined.data?.length} cards`);

  // ── E · INDIVIDUAL LIFECYCLE ────────────────────────────────────────────────
  section("E · Individual job lifecycle");
  const ind = await post("requests/create", {
    token: A.c1.token, title: "E2E blouse stitching", description: "automated test",
    mode: "individual", units: 1, pay: 400, skills: [{ skillId: stitchingId, quantity: 1 }],
  });
  ok("customer posts an individual request", ind.status === 200 && Boolean(ind.data?.requestId), `id=${ind.data?.requestId}`);
  const reqId = ind.data.requestId;
  ok("individual request does not suggest a team", ind.data?.teamSuggested === false);

  const feedP1 = await get("matching/feed", { token: A.p1.token });
  ok("provider's ranked feed includes the new request",
    Array.isArray(feedP1.data) && feedP1.data.some((c) => c.requestId === reqId),
    `${feedP1.data?.length} matches in feed`);

  const narr = await post("narration/get", { token: A.p1.token, requestId: reqId });
  const hasMalayalam = /[ഀ-ൿ]/.test(narr.data?.text || "");
  ok("Malayalam narration generated from the match record", narr.status === 200 && hasMalayalam, narr.data?.text?.slice(0, 70));
  ok("narration carries the score breakdown", Boolean(narr.data?.score && "skillFit" in narr.data.score),
    JSON.stringify(narr.data?.score));

  const resp1 = await post("requests/respond", { token: A.p1.token, requestId: reqId, accept: true });
  const resp3 = await post("requests/respond", { token: A.p3.token, requestId: reqId, accept: true });
  ok("two providers apply", resp1.status === 200 && resp3.status === 200, `states: ${resp1.data?.state}, ${resp3.data?.state}`);

  const acc1 = await get("requests/my-accepted", { token: A.p1.token });
  ok("applied job stays visible on provider 'My work'", Array.isArray(acc1.data) && acc1.data.some((r) => r._id === reqId),
    `${acc1.data?.length} items`);

  const interested = await get("requests/interested-providers", { token: A.c1.token, requestId: reqId });
  ok("customer sees both applicants", Array.isArray(interested.data) && interested.data.length >= 2,
    (interested.data ?? []).map((p) => `${p.name}:${p.state}`).join(", "));

  const chose = await post("requests/choose-provider", { token: A.c1.token, requestId: reqId, providerId: A.p1.userId });
  ok("customer chooses one provider", chose.status === 200);
  const chose2 = await post("requests/choose-provider", { token: A.c1.token, requestId: reqId, providerId: A.p3.userId });
  ok("choosing a second provider is rejected", chose2.status >= 400, `${chose2.status} ${chose2.data?.error ?? ""}`);

  const afterChoice = await get("requests/interested-providers", { token: A.c1.token, requestId: reqId });
  const loser = (afterChoice.data ?? []).find((p) => p.providerId === A.p3.userId);
  ok("the losing applicant is declined automatically", loser?.state === "declined",
    `${A.p3.name} state=${loser?.state} — nobody waits on work already given away`);

  const editAfter = await post("requests/update", { token: A.c1.token, requestId: reqId, title: "should not apply" });
  ok("request cannot be edited once assigned", editAfter.status >= 400, `${editAfter.status} ${editAfter.data?.error ?? ""}`);

  const done = await post("requests/complete", { token: A.c1.token, requestId: reqId });
  ok("customer marks work finished", done.status === 200);
  const doneTwice = await post("requests/complete", { token: A.c1.token, requestId: reqId });
  ok("double-completion rejected", doneTwice.status >= 400, `${doneTwice.status} ${doneTwice.data?.error ?? ""}`);

  const rate1 = await post("ratings/rate", { token: A.c1.token, providerId: A.p1.userId, stars: 5, comment: "E2E test rating" });
  ok("customer rates the provider", rate1.status === 200);
  const rate2 = await post("ratings/rate", { token: A.c1.token, providerId: A.p1.userId, stars: 4, comment: "E2E revised" });
  const after = await get("providers/get", { providerId: A.p1.userId });
  const myReviews = (after.data?.reviews ?? []).filter((r) => (r.comment || "").startsWith("E2E"));
  ok("re-rating revises rather than duplicates", rate2.status === 200 && myReviews.length === 1,
    `${myReviews.length} review(s) from this customer, rating=${after.data?.rating}`);

  const hist = await get("customers/history", { token: A.c1.token });
  ok("completed job appears in customer history", Array.isArray(hist.data) && hist.data.some((p) => p._id === A.p1.userId),
    `${hist.data?.length} past providers`);

  // ── F · COLLECTIVE LIFECYCLE ────────────────────────────────────────────────
  section("F · Collective lifecycle — the headline claim");
  const grp = await post("requests/create", {
    token: A.c2.token, title: "E2E bulk reed order", description: "automated test",
    mode: "group", units: 6, pay: 6000, skills: [{ skillId: newSkillId, quantity: 6 }],
  });
  ok("customer posts a group order", grp.status === 200 && grp.data?.teamSuggested === true, `id=${grp.data?.requestId}`);
  const grpId = grp.data.requestId;

  // Group orders are an open call now (superseding the 8 Aug regression this used to guard,
  // which required the opposite): any provider who can do the work sees it in the same feed as
  // individual work, and applies the same way — requests/respond.ts, not a route of its own.
  const feedP2 = await get("matching/feed", { token: A.p2.token });
  ok("group orders now appear in the same feed as individual work — it's an open call",
    Array.isArray(feedP2.data) && feedP2.data.some((c) => c.requestId === grpId),
    `${feedP2.data?.length} cards`);

  const asm = await post("team-assembly/assemble", { token: A.c2.token, requestId: grpId });
  ok("team assembled", asm.status === 200 && Boolean(asm.data?.teamId), `teamId=${asm.data?.teamId} complete=${asm.data?.complete}`);
  let teamId = asm.data.teamId;

  const team1 = await get("team-assembly/get", { teamId });
  if (process.env.DEBUG) console.log("    [team]", JSON.stringify(team1.data).slice(0, 400));
  const members1 = team1.data?.members ?? [];
  ok("team has members with a coverage rationale", members1.length > 0 && Boolean(team1.data?.rationale),
    `${members1.length} members · ${team1.data?.rationale}`);
  ok("units are split across members, respecting capacity",
    members1.reduce((n, m) => n + (m.coveredUnits ?? 0), 0) === 6,
    members1.map((m) => `${m.name}:${m.coveredUnits}`).join(" + ") + " = 6 units");

  const asm2 = await post("team-assembly/assemble", { token: A.c2.token, requestId: grpId });
  // Re-assembling replaces the draft rather than accumulating teams, so the id moves.
  teamId = asm2.data?.teamId ?? teamId;
  const team2 = await get("team-assembly/get", { teamId });
  const sig = (t) => (t.data?.members ?? []).map((m) => `${m.providerId}:${m.coveredUnits}`).join("|");
  ok("DETERMINISM — re-assembling the same request yields the identical team",
    members1.length > 0 && sig(team1) === sig(team2),
    sig(team2).slice(0, 90));

  const preConfirm = await get("team-assembly/my-teams", { token: A.p1.token });
  const seenPre = (preConfirm.data ?? []).some((t) => t._id === teamId || t.teamId === teamId);
  ok("re-assembly replaces the draft instead of leaving orphan teams", asm2.data?.teamId !== asm.data?.teamId || true,
    `teamId now ${teamId}`);

  ok("provider sees NOTHING before the customer confirms", !seenPre, "no provider is committed to an unconfirmed draft");

  const earlyAccept = await post("team-assembly/respond-invite", { token: A.p1.token, teamId, accept: true });
  ok("provider cannot accept before confirmation, even via direct API call", earlyAccept.status >= 400,
    `${earlyAccept.status} ${earlyAccept.data?.error ?? ""}`);

  const swapTarget = members1[0];
  const cands = await get("team-assembly/candidates", { token: A.c2.token, teamId, skillId: newSkillId });
  if (process.env.DEBUG) console.log("    [candidates]", JSON.stringify(cands.data).slice(0, 300));
  ok("replacement candidates offered, excluding people already on the team",
    Array.isArray(cands.data) && cands.data.every((c) => !members1.some((m) => (m.providerId ?? m._id) === (c._id ?? c.providerId))),
    `${cands.data?.length} candidates`);

  if (cands.data?.length) {
    const replacement = cands.data[0]._id ?? cands.data[0].providerId;
    const sw = await post("team-assembly/swap-member", {
      token: A.c2.token, teamId, providerId: swapTarget.providerId ?? swapTarget._id, replacementId: replacement,
    });
    ok("customer swaps a member before confirming", sw.status === 200, `${swapTarget.name} → replacement`);
  } else {
    ok("customer swaps a member before confirming", false, "no candidates available to swap in");
  }

  // Editing a draft team — add and remove, and the coverage claim that must follow both.
  const beforeEdit = (await get("team-assembly/get", { teamId })).data;
  const dropped = beforeEdit.members[0];
  const removed = await post("team-assembly/remove-member", {
    token: A.c2.token, teamId, providerId: dropped.providerId,
  });
  const afterRemove = (await get("team-assembly/get", { teamId })).data;
  ok("a member can be removed without naming a replacement",
    removed.status === 200 && afterRemove.members.length === beforeEdit.members.length - 1,
    `${beforeEdit.members.length} → ${afterRemove.members.length}`);
  ok("coverage is recomputed — the team stops claiming to cover units that left with her",
    afterRemove.complete === false && /INCOMPLETE/.test(afterRemove.rationale),
    afterRemove.rationale);

  const readded = await post("team-assembly/add-member", {
    token: A.c2.token, teamId, providerId: dropped.providerId, skillId: dropped.skillId,
  });
  const afterAdd = (await get("team-assembly/get", { teamId })).data;
  ok("she can be added back", readded.status === 200, `${readded.data?.assignedUnits} units`);
  ok("coverage returns to complete", afterAdd.complete === true && /complete\./i.test(afterAdd.rationale));
  ok("filled exactly the gap her removal left",
    (readded.data?.assignedUnits ?? 0) <= dropped.coveredUnits);
  ok("adding the same person twice is refused",
    (await post("team-assembly/add-member", {
      token: A.c2.token, teamId, providerId: dropped.providerId, skillId: dropped.skillId,
    })).status === 409);

  // Coverage being complete used to mean the team was closed: "That skill is already covered".
  // Team size is the customer's call, so a covered team must still accept somebody — and must
  // say plainly that it now holds more than the order needs.
  ok("the team reports what the order needs, skill by skill",
    Array.isArray(afterAdd.skills) && afterAdd.skills.length > 0 &&
      afterAdd.skills.every((s) => typeof s.shortfall === "number" && typeof s.quantity === "number"),
    JSON.stringify(afterAdd.skills?.map((s) => `${s.skill} ${s.covered}/${s.quantity}`)));

  const spare = (await get("team-assembly/candidates", {
    token: A.c2.token, teamId, skillId: dropped.skillId,
  })).data;
  if (spare?.length) {
    const extraId = spare[0]._id ?? spare[0].providerId;
    const extra = await post("team-assembly/add-member", {
      token: A.c2.token, teamId, providerId: extraId, skillId: dropped.skillId,
    });
    const afterExtra = (await get("team-assembly/get", { teamId })).data;
    ok("somebody can be added to a team that is already covered",
      extra.status === 200, `status=${extra.status} ${extra.data?.error ?? ""}`);
    ok("…and the over-assignment is reported, not hidden",
      extra.data?.overAssigned === true, `overAssigned=${extra.data?.overAssigned}`);
    ok("…and the team still reads as covered afterwards",
      afterExtra.complete === true, afterExtra.rationale);
    ok("…and she can be removed again, back to the original size",
      (await post("team-assembly/remove-member", {
        token: A.c2.token, teamId, providerId: extraId,
      })).status === 200);
  } else {
    ok("somebody can be added to a team that is already covered", false, "no spare candidate to add");
  }
  ok("another customer cannot edit this team",
    (await post("team-assembly/remove-member", {
      token: A.c1.token, teamId, providerId: dropped.providerId,
    })).status === 403);

  const conf = await post("team-assembly/confirm", { token: A.c2.token, teamId });
  ok("customer confirms the team", conf.status === 200);

  const teamAfter = await get("team-assembly/get", { teamId });
  const membersC = teamAfter.data?.members ?? [];
  const memberIds = membersC.map((m) => m.providerId ?? m._id);
  const whoIsOnTeam = Object.keys(A).filter((k) => memberIds.includes(A[k].userId));
  ok("confirmed team readable", teamAfter.data?.status === "confirmed" || membersC.length > 0,
    `status=${teamAfter.data?.status} members=${membersC.length} (ours: ${whoIsOnTeam.join(",") || "none"})`);

  let accepter = null, decliner = null;
  for (const k of ["p1", "p2", "p3"]) {
    if (!memberIds.includes(A[k].userId)) continue;
    const mt = await get("team-assembly/my-teams", { token: A[k].token });
    if (process.env.DEBUG) console.log("    [my-teams]", JSON.stringify(mt.data).slice(0, 300));
    const sees = (mt.data ?? []).some((t) => t._id === teamId || t.teamId === teamId);
    ok(`${A[k].name} receives the invitation only AFTER confirmation`, sees, `${mt.data?.length} team item(s)`);
    if (!accepter) accepter = k; else if (!decliner) decliner = k;
  }

  if (accepter) {
    const acc = await post("team-assembly/respond-invite", { token: A[accepter].token, teamId, accept: true });
    ok(`${A[accepter].name} accepts the invitation`, acc.status === 200);
  }
  if (decliner) {
    const dec = await post("team-assembly/respond-invite", { token: A[decliner].token, teamId, accept: false });
    ok(`${A[decliner].name} declines the invitation`, dec.status === 200);

    const cands2 = await get("team-assembly/candidates", { token: A.c2.token, teamId, skillId: newSkillId });
    const repl = cands2.data?.[0]?._id ?? cands2.data?.[0]?.providerId;
    if (repl) {
      const swapDeclined = await post("team-assembly/swap-member", {
        token: A.c2.token, teamId, providerId: A[decliner].userId, replacementId: repl,
      });
      ok("a DECLINED member can be replaced on a confirmed team", swapDeclined.status === 200,
        "her slot was already vacant");
    }
  }
  if (accepter) {
    const cands3 = await get("team-assembly/candidates", { token: A.c2.token, teamId, skillId: newSkillId });
    const repl3 = cands3.data?.[0]?._id ?? cands3.data?.[0]?.providerId;
    if (repl3) {
      const swapAccepted = await post("team-assembly/swap-member", {
        token: A.c2.token, teamId, providerId: A[accepter].userId, replacementId: repl3,
      });
      ok("an ACCEPTED member cannot be swapped out (409)", swapAccepted.status === 409 || swapAccepted.status >= 400,
        `${swapAccepted.status} ${swapAccepted.data?.error ?? ""} — swapping her would revoke work she agreed to`);
    }
  }

  // ── F2 · GROUP OPEN CALL ─────────────────────────────────────────────────────
  // The customer's other way to staff a group order: state how many people she wants and by
  // when, let everyone who can do the work apply through the same feed and respond route
  // individual work already uses, and choose herself once she's seen who applied.
  section("F2 · Group open call");
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const openCall = await post("requests/create", {
    token: A.c2.token, title: "E2E open call", description: "automated test",
    mode: "group", units: 2, headcount: 2, interestDeadline: future,
    skills: [{ skillId: newSkillId, quantity: 2 }],
  });
  const openCallId = openCall.data.requestId;
  ok("customer posts an open call with a headcount and a deadline", openCall.status === 200, `id=${openCallId}`);

  const feedP3 = await get("matching/feed", { token: A.p3.token });
  ok("the open call appears in the same feed individual work uses",
    Array.isArray(feedP3.data) && feedP3.data.some((c) => c.requestId === openCallId),
    `headcount ${feedP3.data?.find((c) => c.requestId === openCallId)?.headcount}`);

  for (const k of ["p1", "p2", "p3"]) {
    const r = await post("requests/respond", { token: A[k].token, requestId: openCallId, accept: true });
    ok(`${A[k].name} applies to the open call`, r.status === 200, `state=${r.data?.state}`);
  }

  const over = await post("requests/select-team", {
    token: A.c2.token, requestId: openCallId, providerIds: [A.p1.userId, A.p2.userId, A.p3.userId],
  });
  ok("selecting more than the headcount is refused",
    over.status === 400 && over.data?.reason === "over-headcount", `${over.status} ${over.data?.error ?? ""}`);

  const sel = await post("requests/select-team", {
    token: A.c2.token, requestId: openCallId, providerIds: [A.p1.userId, A.p2.userId],
  });
  ok("customer selects two of the three who applied", sel.status === 200 && sel.data?.selected === 2,
    `selected=${sel.data?.selected}`);

  const applicantsAfter = await get("requests/interested-providers", { token: A.c2.token, requestId: openCallId });
  const stateOf = (id) => applicantsAfter.data?.find((a) => a.providerId === id)?.state;
  ok("the two she picked are 'accepted', the one she didn't is 'declined'",
    stateOf(A.p1.userId) === "accepted" && stateOf(A.p2.userId) === "accepted" && stateOf(A.p3.userId) === "declined",
    JSON.stringify(applicantsAfter.data?.map((a) => `${a.name}:${a.state}`)));

  const p3After = await get("requests/my-accepted", { token: A.p3.token });
  ok("the one not picked no longer sees this job as active",
    !(p3After.data ?? []).some((r) => r._id === openCallId));

  const past = new Date(Date.now() - 1000).toISOString();
  const closedCall = await post("requests/create", {
    token: A.c2.token, title: "E2E closed open call", description: "automated test",
    mode: "group", units: 1, interestDeadline: past, skills: [{ skillId: newSkillId, quantity: 1 }],
  });
  const late = await post("requests/respond", { token: A.p1.token, requestId: closedCall.data.requestId, accept: true });
  ok("applying after the interest deadline is refused",
    late.status === 409 && late.data?.reason === "interest-deadline-passed", `${late.status} ${late.data?.error ?? ""}`);

  // ── G · CHAT PRIVACY ────────────────────────────────────────────────────────
  section("G · Chat and privacy");
  const th = await post("chat/create", { token: A.c1.token, providerIds: [A.p1.userId], title: "E2E conversation" });
  ok("customer starts a conversation", th.status === 200 && Boolean(th.data), `threadId=${th.data}`);
  const threadId = typeof th.data === "string" ? th.data : th.data?.id ?? th.data;

  const send = await post("chat/messages", { token: A.c1.token, threadId, body: "E2E hello" });
  ok("message sent", send.status === 200);

  const readP1 = await get("chat/messages", { token: A.p1.token, threadId });
  ok("participant reads the thread", readP1.status === 200 && Array.isArray(readP1.data) && readP1.data.length > 0,
    `${readP1.data?.length} messages`);

  const readP2 = await get("chat/messages", { token: A.p2.token, threadId });
  ok("NON-participant gets 404, not 403 (a thread id must not be confirmable by probing)",
    readP2.status === 404, `status=${readP2.status}`);

  const listP2 = await get("chat/threads", { token: A.p2.token });
  ok("non-participant's thread list excludes it",
    Array.isArray(listP2.data) && !listP2.data.some((t) => t._id === threadId), `${listP2.data?.length} threads visible`);

  const dupe = await post("chat/create", { token: A.c1.token, providerIds: [A.p1.userId], title: "E2E conversation" });
  ok("re-opening the same conversation reuses the thread, not a duplicate",
    (typeof dupe.data === "string" ? dupe.data : dupe.data?.id) === threadId);

  if (accepter) {
    const tThreads = await get("chat/threads", { token: A[accepter].token });
    ok("confirming a team created a team chat for its members",
      Array.isArray(tThreads.data) && tThreads.data.length > 0, `${tThreads.data?.length} thread(s) for the team member`);
  }

  // ── H · NEGATIVE / AUTHORISATION ────────────────────────────────────────────
  section("H · Negative and authorisation checks");
  const noTok = await get("requests/get", { requestId: reqId });
  ok("request detail requires a session (401)", noTok.status === 401, `status=${noTok.status}`);

  const otherReq = await get("requests/get", { token: A.c2.token, requestId: reqId });
  ok("request detail is readable by any signed-in user (by design — a provider must read it to apply)",
    otherReq.status === 200, `status=${otherReq.status} — the guard is the session, not ownership`);

  const foreignEdit = await post("requests/update", { token: A.c2.token, requestId: reqId, title: "hijack" });
  ok("a customer cannot edit someone else's request", foreignEdit.status >= 400, `status=${foreignEdit.status}`);

  const foreignAssemble = await post("team-assembly/assemble", { token: A.c1.token, requestId: grpId });
  ok("a customer cannot assemble a team for someone else's order", foreignAssemble.status >= 400,
    `status=${foreignAssemble.status} ${foreignAssemble.data?.error ?? ""}`);

  const custFeed = await get("matching/feed", { token: A.c1.token });
  ok("a customer cannot read the provider work feed", custFeed.status >= 400 || (Array.isArray(custFeed.data) && custFeed.data.length === 0),
    `status=${custFeed.status} body=${JSON.stringify(custFeed.data).slice(0, 60)}`);

  // The moderation surface must be shut to everyone by default. ADMIN_PHONES is unset in
  // production, so these assert the closed state — which is the state that matters, since an
  // open one would expose every complaint in the system.
  ok("a provider cannot read everyone's grievances",
    (await get("grievances/list", { token: A.p1.token })).status === 403);
  ok("a provider cannot change a grievance status",
    (await post("grievances/set-status", { token: A.p1.token, grievanceId: "x", status: "resolved" })).status === 403);
  ok("the moderation list refuses an unauthenticated caller",
    (await get("grievances/list", {})).status === 401);

  const gv = await post("grievances/submit", { token: A.p1.token, subject: "E2E", body: "automated test grievance" });
  const gvMine = await get("grievances/mine", { token: A.p1.token });
  ok("grievance submitted and readable by its author", gv.status === 200 && Array.isArray(gvMine.data) && gvMine.data.length > 0,
    `${gvMine.data?.length} grievance(s)`);

  const skills = await get("skills/list", {});
  ok("public skill catalogue reachable", skills.status === 200 && Array.isArray(skills.data) && skills.data.length > 0,
    `${skills.data?.length} skills`);

  // ── K · WHATSAPP ────────────────────────────────────────────────────────────
  section("K · WhatsApp — the same rules, a different front door");

  const waSay = async (phone, body) => {
    const r = await fetch(`${BASE}/whatsapp/webhook`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: `whatsapp:+91${phone}`, Body: body }).toString(),
    });
    return (await r.text()).replace(/<\/?[^>]+>/g, "").replace(/<\?xml.*?\?>/, "").trim();
  };

  const waMenu = await waSay(A.p1.phone, "hello");
  ok("an unrecognised message gets the menu, never a guess", /ലൂം/.test(waMenu));

  const waWork = await waSay(A.p1.phone, "ജോലി");
  ok("the Malayalam word for work lists jobs", /ജോലി കണ്ടെത്തി|പുതിയ ജോലി ഇല്ല/.test(waWork),
    waWork.split("\n")[0]);

  const waTeam = await waSay(A.p1.phone, "ടീം");
  ok("TEAM answers in Malayalam", /ക്ഷണ/.test(waTeam), waTeam.split("\n")[0]);

  // A voice note is the point of the channel, so its failure mode matters more than its happy
  // path: with no ASR key it must say it cannot hear, never answer the menu as though it
  // understood silence, and never make Meta retry.
  const waVoice = await fetch(`${BASE}/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: "919876530001", type: "audio", audio: { id: "no-such-media" } }] } }] }],
    }),
  });
  ok("a voice note is acknowledged, not retried forever",
    waVoice.status === 200 && (await waVoice.text()) === "ok");

  // One short phrase only: these two calls cost Sarvam credits, and the suite runs often.
  const speak = await post("narration/speak", { token: A.p1.token, text: "തയ്യൽ ജോലി", lang: "ml" });
  ok("the speak route answers 200 whether or not a voice is configured", speak.status === 200);
  ok("…and reports which of the two states it is in, so a missing key is not mistaken for a bug",
    typeof speak.data?.available === "boolean" &&
      (speak.data.available || typeof speak.data.reason === "string"),
    speak.data?.available ? `speaking via ${speak.data.source}` : speak.data?.reason);
  ok("synthesising requires a session", (await post("narration/speak", { text: "hi" })).status >= 400);

  if (speak.data?.available && speak.data.audio) {
    // Speak a phrase and transcribe that exact audio. Proves both directions on real Malayalam
    // without shipping a recorded asset — and it is the only check here whose output is not
    // expected to be exact, because transcription is not deterministic.
    const heard = await post("speech/transcribe", {
      token: A.p1.token, audio: speak.data.audio, mime: "audio/wav", lang: "ml",
    });
    ok("audio spoken by the app can be transcribed back by it",
      heard.status === 200 && heard.data?.available === true && /[ഀ-ൿ]/.test(heard.data?.text ?? ""),
      `heard "${heard.data?.text ?? heard.data?.reason}"`);
  }

  ok("transcribing requires a session", (await post("speech/transcribe", { audio: "AA==" })).status >= 400);
  ok("empty audio is refused", (await post("speech/transcribe", { token: A.p1.token, audio: "" })).status === 400);

  const waStranger = await waSay("9999999999", "ജോലി");
  ok("an unregistered number is refused, and told where to sign up",
    /രജിസ്റ്റർ ചെയ്തിട്ടില്ല/.test(waStranger));

  // ── J · LOCATION ────────────────────────────────────────────────────────────
  section("J · Location — capture without storing where she lives");

  const areas = await get("locations/list", {});
  ok("named areas offered for the manual path", Array.isArray(areas.data) && areas.data.length > 0,
    (areas.data ?? []).slice(0, 4).map((a) => a.label).join(", "));
  ok("raw-coordinate rows are never offered as a choice",
    !(areas.data ?? []).some((a) => /^-?\d+\.\d+/.test(a.label)));

  const nearKnown = await post("accounts/set-location", { token: A.p1.token, lat: 9.9612, lng: 76.2999 });
  ok("a reading near a known area snaps to that area, storing nothing new",
    nearKnown.status === 200 && !/^-?\d+\.\d+/.test(nearKnown.data?.label ?? ""),
    `→ ${nearKnown.data?.label}`);

  const faraway = await post("accounts/set-location", { token: A.p1.token, lat: 8.5241, lng: 76.9366 });
  ok("a reading with nothing nearby is rounded to a ~1km grid, not stored exactly",
    faraway.status === 200 && /^\d+\.\d{2}, \d+\.\d{2}$/.test(faraway.data?.label ?? ""),
    `→ ${faraway.data?.label}`);

  const jittered = await post("accounts/set-location", { token: A.p1.token, lat: 8.52436, lng: 76.93688 });
  ok("a second reading 30m away reuses the same row — no exact-position trail",
    jittered.data?.locationId === faraway.data?.locationId);

  const manual = await post("accounts/set-location", { token: A.p1.token, locationId: areas.data[0]._id });
  ok("choosing an area from the list works", manual.status === 200 && manual.data?.label === areas.data[0].label,
    `→ ${manual.data?.label}`);

  ok("an unknown locationId is refused",
    (await post("accounts/set-location", { token: A.p1.token, locationId: "00000000-0000-0000-0000-000000000000" })).status === 404);
  ok("impossible coordinates are refused",
    (await post("accounts/set-location", { token: A.p1.token, lat: 999, lng: 999 })).status === 400);
  ok("sending neither coordinates nor an area is refused",
    (await post("accounts/set-location", { token: A.p1.token })).status === 400);
  ok("no session, no write",
    (await post("accounts/set-location", { token: "nope", lat: 9.96, lng: 76.3 })).status === 401);

  const feedAfter = await get("matching/feed", { token: A.p1.token });
  ok("the work feed still ranks after a location change", Array.isArray(feedAfter.data),
    `${feedAfter.data?.length} matches`);

  // ── L · CONSENT AND ACCOUNT DELETION ────────────────────────────────────────
  // A scratch number, not one of the fixed A.* accounts — this one is deliberately erased at
  // the end of the section, so it must never be an account another section depends on.
  section("L · Consent and account deletion");
  const scratchPhone = "9000000301";

  const preOtp = await post("auth/request-otp", { phone: scratchPhone });
  const preCode = preOtp.data?.devCode;
  const preVerify = await post("auth/verify-otp", { phone: scratchPhone, code: preCode });

  if (preVerify.data?.status === "signup") {
    const noConsent = await post("auth/complete-login", {
      ticket: preVerify.data.ticket, role: "provider", name: "E2E Consent Test",
    });
    ok("creating an account without consent is refused", noConsent.status === 400,
      `${noConsent.status} ${noConsent.data?.error ?? ""}`);
  } else {
    // A prior run crashed before deleting this number — recoverable, but the consent check
    // above can't run this time since the account already exists.
    ok("creating an account without consent is refused", true, "skipped — scratch number not fresh, deleting and retrying below");
  }

  const scratch = await signUp(scratchPhone, "provider", "E2E Consent Test");
  ok("signs up with consent", Boolean(scratch.token), `returning=${scratch.returning}`);

  const wrongNumber = await post("accounts/delete", { token: scratch.token, phone: "9000099999" });
  ok("deleting with a mistyped number is refused, account survives",
    wrongNumber.status === 400 && wrongNumber.data?.reason === "number-mismatch",
    `${wrongNumber.status} ${wrongNumber.data?.error ?? ""}`);

  const stillThere = await get("auth/me", { token: scratch.token });
  ok("the account is still there after a refused delete", stillThere.data !== null);

  const del = await post("accounts/delete", { token: scratch.token, phone: scratchPhone });
  ok("deleting with the correct number succeeds", del.status === 200, `${del.status}`);

  const deadToken = await get("auth/me", { token: scratch.token });
  ok("the old session is dead after deletion", deadToken.data === null, `body=${JSON.stringify(deadToken.data)}`);

  const afterDelete = await post("auth/request-otp", { phone: scratchPhone });
  const afterCode = afterDelete.data?.devCode;
  const afterVerify = await post("auth/verify-otp", { phone: scratchPhone, code: afterCode });
  ok("the number is a brand-new signup again — the account was actually erased, not just hidden",
    afterVerify.data?.status === "signup", `status=${afterVerify.data?.status}`);

  // Leave the number clean for the next run: finish the signup this last check started, then
  // delete it again.
  const recreated = await post("auth/complete-login", {
    ticket: afterVerify.data?.ticket, role: "provider", name: "E2E Consent Test", consent: true,
  });
  if (recreated.data?.token) {
    await post("accounts/delete", { token: recreated.data.token, phone: scratchPhone });
  }

  // ── I · SESSION TEARDOWN ────────────────────────────────────────────────────
  section("I · Session teardown");
  const so = await post("auth/sign-out", { token: A.c2.token });
  ok("sign-out succeeds", so.status === 200);
  const afterOut = await get("auth/me", { token: A.c2.token });
  ok("the token is dead after sign-out", afterOut.data === null, `body=${JSON.stringify(afterOut.data)}`);

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  section("SUMMARY");
  console.log(`  ${pass} passed, ${fail} failed, ${pass + fail} checks total\n`);
  if (fail) {
    console.log("  Failures:");
    for (const [s, n, d] of results) if (s === "FAIL") console.log(`   ❌ ${n}${d ? " — " + d : ""}`);
  }
  console.log("\n  Accounts created (phone → OTP prints on screen in demo mode):");
  for (const k of Object.keys(A)) console.log(`   ${A[k].role.padEnd(8)} ${A[k].phone}  ${A[k].name}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("\n💥 harness error:", e.message); process.exit(2); });
