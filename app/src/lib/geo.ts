// Asking the browser where it is, with the failure cases treated as normal.
//
// `navigator.geolocation` fails far more often than its API shape suggests: permission refused,
// no fix indoors, an OS-level location toggle that is off, and — on the devices this app targets
// — a prompt whose wording a first-time user has no reason to trust. It also has no timeout by
// default, so a request that will never resolve simply never resolves, leaving a spinner
// forever. Every one of those is a normal outcome here, not an error to report.
//
// So this never rejects. It returns why it failed, and the caller offers the list instead.

export type Fix =
  | { ok: true; lat: number; lng: number; accuracyM: number }
  | { ok: false; reason: "unsupported" | "denied" | "unavailable" | "timeout" };

const TIMEOUT_MS = 10_000;

export function currentPosition(): Promise<Fix> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }

  return new Promise<Fix>((resolve) => {
    let settled = false;
    const done = (f: Fix) => {
      if (!settled) {
        settled = true;
        resolve(f);
      }
    };

    // Belt and braces: some Android WebViews ignore the options timeout entirely.
    const timer = setTimeout(() => done({ ok: false, reason: "timeout" }), TIMEOUT_MS + 1000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
      },
      (err) => {
        clearTimeout(timer);
        done({
          ok: false,
          reason:
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : err.code === err.TIMEOUT
                ? "timeout"
                : "unavailable",
        });
      },
      // A coarse fix is the right trade: the reading is snapped to a known area server-side
      // anyway, so high accuracy would cost battery and time to buy precision we discard.
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 5 * 60 * 1000 },
    );
  });
}
