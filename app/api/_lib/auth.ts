import { supabaseAdmin } from "./supabase.js";
import { HttpError } from "./http.js";

export type Role = "provider" | "customer" | "admin";

export type Session = {
  id: string;
  token: string;
  role: Role;
  userId: string;
  phoneHash: string;
};

function mapSession(row: {
  id: string;
  token: string;
  role: Role;
  user_id: string;
  phone_hash: string;
}): Session {
  return { id: row.id, token: row.token, role: row.role, userId: row.user_id, phoneHash: row.phone_hash };
}

export async function sessionByToken(token: string): Promise<Session | null> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id, token, role, user_id, phone_hash")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data ? mapSession(data) : null;
}

export async function requireSession(token: string | undefined): Promise<Session> {
  if (!token) throw new HttpError(401, "Not authenticated");
  const s = await sessionByToken(token);
  if (!s) throw new HttpError(401, "Not authenticated");
  return s;
}

export async function requireRole(token: string | undefined, role: Role): Promise<Session> {
  const s = await requireSession(token);
  if (s.role !== role) throw new HttpError(403, `Requires ${role} role`);
  return s;
}
