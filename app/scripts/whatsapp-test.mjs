// Simulates Twilio's webhook posts, so the bot can be exercised before any Twilio account
// exists. Uses seeded provider numbers — see `npm run seed` output.
const BASE = process.env.LOOM_BASE || "https://loom-lovat-phi.vercel.app/api";
const FROM = process.env.FROM || "whatsapp:+919876530001";

async function send(text) {
  const res = await fetch(`${BASE}/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: FROM, Body: text, To: "whatsapp:+14155238886" }).toString(),
  });
  const xml = await res.text();
  const msg = xml.replace(/<\/?[^>]+>/g, "").replace(/<\?xml.*?\?>/, "").trim();
  console.log(`\n\x1b[2m─── you: ${text}\x1b[0m`);
  console.log(msg.split("\n").map(l => "   " + l).join("\n"));
  return msg;
}

console.log(`Simulating WhatsApp from ${FROM}`);
for (const m of process.argv.slice(2).length ? process.argv.slice(2) : ["hello", "work", "1", "my work"]) {
  await send(m);
}
