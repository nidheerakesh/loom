import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/auth.js";
import { resolveLocationId } from "../../_lib/geo.js";

// Where a provider works from, or where a customer's work is. Until now this was assigned from
// a hash of the phone number at signup — deterministic, so distances were arithmetic over
// coordinates that meant nothing.
//
// Two ways in, because a device that will not give you a location is the common case rather
// than the exception. Permission gets refused, indoor GPS fails, and a woman who does not know
// what the prompt is asking will tap the safe-looking button. An app whose only path is
// `navigator.geolocation` simply has no location for those users, so `locationId` lets her pick
// her area from a list instead. Neither path is a fallback for the other; both are first class.
//
// A captured reading is never stored as given — see resolveLocationId for why that matters
// here specifically.
const Body = z
  .object({
    token: z.string().min(1),
    lat: z.number().optional(),
    lng: z.number().optional(),
    locationId: z.string().min(1).optional(),
  })
  .refine((b) => (b.lat !== undefined && b.lng !== undefined) || b.locationId !== undefined, {
    message: "Send either coordinates or a locationId",
  });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, lat, lng, locationId } = Body.parse(req.body);
  const s = await requireSession(token);

  let resolved: string;
  if (locationId) {
    // Only somewhere we already know about — this must not become a way to write arbitrary ids.
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, "No such place");
    resolved = data.id;
  } else {
    resolved = await resolveLocationId(lat!, lng!);
  }

  const { error } =
    s.role === "provider"
      ? await supabaseAdmin
          .from("providers")
          .update({ home_location_id: resolved })
          .eq("id", s.userId)
      : await supabaseAdmin.from("customers").update({ location_id: resolved }).eq("id", s.userId);
  if (error) throw new HttpError(500, error.message);

  const { data: place, error: placeErr } = await supabaseAdmin
    .from("locations")
    .select("id, label")
    .eq("id", resolved)
    .maybeSingle();
  if (placeErr) throw new HttpError(500, placeErr.message);

  res.status(200).json({ locationId: resolved, label: place?.label ?? "" });
});
