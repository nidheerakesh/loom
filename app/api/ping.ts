// TEMPORARY diagnostic. A static (non-dynamic) API route, used to tell apart two causes of
// /api/* returning 404: if /api/ping works while /api/skills/list does not, the problem is
// specifically Vercel's routing of the `[...path]` catch-all. Delete once diagnosed.
export default function handler(_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  res.status(200).json({ ok: true, route: "static" });
}
