import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { fnv1a } from "../../_lib/text.js";
import { toE164, testCodeFor, twilioConfigured, checkVerification } from "../../_lib/sms.js";

const Body = z.object({
  phone: z.string().min(1),
  code: z.string().min(1),
  role: z.enum(["provider", "customer", "admin"]),
  name: z.string().optional(),
});

type Role = "provider" | "customer" | "admin";

// Mock-path verification — mirrors the old convex/auth.ts verifyMockOtp exactly.
async function verifyMockOtp(phoneHash: string, role: Role, code: string): Promise<void> {
  const { data: otp, error } = await supabaseAdmin
    .from("otps")
    .select("id, role, expires_at, code_hash")
    .eq("phone_hash", phoneHash)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!otp || otp.role !== role) throw new HttpError(401, "Request a code first");
  if (new Date(otp.expires_at).getTime() < Date.now()) throw new HttpError(401, "Code expired");
  if (otp.code_hash !== fnv1a("code:" + code)) throw new HttpError(401, "Wrong code");
  await supabaseAdmin.from("otps").delete().eq("id", otp.id);
}

// Deterministic seeded location/group so a fresh signup is matchable within the cluster.
async function pickLocationId(phoneHash: string): Promise<string> {
  const { data: locs, error } = await supabaseAdmin.from("locations").select("id").limit(200);
  if (error) throw new HttpError(500, error.message);
  if (!locs || locs.length === 0) {
    const { data, error: insErr } = await supabaseAdmin
      .from("locations")
      .insert({ lat: 9.9, lng: 76.3, label: "Home" })
      .select("id")
      .single();
    if (insErr) throw new HttpError(500, insErr.message);
    return data.id;
  }
  const idx = parseInt(fnv1a(phoneHash), 16) % locs.length;
  return locs[idx].id;
}

async function pickGroupId(phoneHash: string): Promise<string | null> {
  const { data: groups, error } = await supabaseAdmin.from("groups").select("id").limit(200);
  if (error) throw new HttpError(500, error.message);
  if (!groups || groups.length === 0) return null;
  const idx = parseInt(fnv1a("g" + phoneHash), 16) % groups.length;
  return groups[idx].id;
}

function genToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

async function completeLogin(
  phoneHash: string,
  role: Role,
  name: string | undefined,
): Promise<{ token: string; role: Role; userId: string }> {
  let userId: string;

  if (role === "provider") {
    const { data: existing, error } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("phone_hash", phoneHash)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (existing) {
      userId = existing.id;
    } else {
      const homeLocationId = await pickLocationId(phoneHash);
      const groupId = await pickGroupId(phoneHash);
      const { data: created, error: insErr } = await supabaseAdmin
        .from("providers")
        .insert({
          name: name ?? "New provider",
          phone_hash: phoneHash,
          available: true,
          capacity: 1,
          experience_years: 0,
          rating: 0,
          rating_count: 0,
          languages: ["ml"],
          home_location_id: homeLocationId,
          group_id: groupId,
        })
        .select("id")
        .single();
      if (insErr) throw new HttpError(500, insErr.message);
      userId = created.id;
    }
  } else if (role === "customer") {
    const { data: existing, error } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("phone_hash", phoneHash)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (existing) {
      userId = existing.id;
    } else {
      const locationId = await pickLocationId(phoneHash);
      const { data: created, error: insErr } = await supabaseAdmin
        .from("customers")
        .insert({ name: name ?? "New customer", phone_hash: phoneHash, location_id: locationId })
        .select("id")
        .single();
      if (insErr) throw new HttpError(500, insErr.message);
      userId = created.id;
    }
  } else {
    userId = "admin";
  }

  const token = genToken();
  const { error: sessErr } = await supabaseAdmin
    .from("sessions")
    .insert({ token, role, user_id: userId, phone_hash: phoneHash });
  if (sessErr) throw new HttpError(500, sessErr.message);

  return { token, role, userId };
}

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { phone, code, role, name } = Body.parse(req.body);
  const e164 = toE164(phone);
  const phoneHash = fnv1a("phone:" + e164);

  const testCode = testCodeFor(e164);
  if (testCode !== null) {
    if (code !== testCode) throw new HttpError(401, "Wrong code");
  } else if (twilioConfigured()) {
    const approved = await checkVerification(e164, code);
    if (!approved) throw new HttpError(401, "Wrong code");
  } else {
    await verifyMockOtp(phoneHash, role, code);
  }

  const result = await completeLogin(phoneHash, role, name);
  res.status(200).json(result);
});
