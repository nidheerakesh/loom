// Pre-flight for the live demo. READ-ONLY on purpose: it never assembles a team, because
// assembling moves the headline order from `open` to `assembling` and no route puts it back —
// which would silently destroy the "one tap and the team appears" beat.
//
//   node scripts/demo-preflight.mjs
//
// Run it after the final reseed, once the devices are signed in.

const BASE = process.env.LOOM_BASE || "https://loom-lovat-phi.vercel.app/api";

const CUSTOMER = ["9876540002", "Sr. Alphonsa", "laptop, projected"];
const PHONES = [
  ["9876530006", "Sheeba Thomas", "phone A"],
  ["9876530038", "Sumangala Pillai", "phone B"],
  ["9876530005", "Fathima Beevi", "phone C"],
];

const call = async (method, path, body, query) => {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
};

async function signIn(phone) {
  const otp = await call("POST", "auth/request-otp", { phone });
  const code = otp.data?.devCode;
  if (!code) return { error: "no code returned" };
  const v = await call("POST", "auth/verify-otp", { phone, code });
  if (v.data?.status !== "session") return { error: `status "${v.data?.status}" — not a known account` };
  return { token: v.data.token };
}

let bad = 0;
const ok = (pass, label, detail = "") => {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) bad++;
};

console.log("\nLoom · demo pre-flight\n");

// 1. The site itself.
const site = await fetch(BASE.replace(/\/api$/, ""));
ok(site.ok, "site responds", `${site.status}`);

// 2. The customer account, and the order the whole demo hangs on.
const cust = await signIn(CUSTOMER[0]);
ok(!cust.error, `${CUSTOMER[1]} signs in (${CUSTOMER[2]})`, cust.error ?? CUSTOMER[0]);

if (cust.token) {
  const reqs = await call("GET", "customers/my-requests", null, { token: cust.token });
  const uniforms = (reqs.data ?? []).find((r) => /uniform/i.test(r.title));
  ok(Boolean(uniforms), "30 school uniform sets exists");
  if (uniforms) {
    ok(
      uniforms.status === "open",
      "…and is still `open`",
      uniforms.status === "open"
        ? "the Assemble beat will work"
        : `status is "${uniforms.status}" — RESEED, or the team is already assembled`,
    );
  }
}

// 3. Every phone can sign in as the person it is supposed to be.
for (const [phone, name, role] of PHONES) {
  const s = await signIn(phone);
  ok(!s.error, `${name} signs in (${role})`, s.error ?? phone);
}

// 4. The WhatsApp console, for the Q&A answer.
const wa = await fetch(`${BASE}/whatsapp/webhook`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ From: `whatsapp:+91${PHONES[0][0]}`, Body: "ജോലി" }).toString(),
});
const waText = await wa.text();
ok(waText.includes("<Message>"), "WhatsApp console answers", waText.includes("കണ്ടെത്തി") ? "in Malayalam" : "");

console.log(
  bad === 0
    ? "\nAll clear. Do not assemble the team again before you present.\n"
    : `\n${bad} problem(s) above — fix before presenting.\n`,
);
process.exit(bad === 0 ? 0 : 1);
