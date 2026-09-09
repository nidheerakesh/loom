import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { SignIn } from "./features/SignIn";
import { Landing } from "./features/Landing";
import { ProviderApp } from "./features/provider/ProviderApp";
import { CustomerApp } from "./features/customer/CustomerApp";
import { AdminApp } from "./features/admin/AdminApp";

export default function App() {
  const { token, setToken, me } = useAuth();
  // Signed-out visitors get the landing page first and reach sign-in by asking for it. Kept as
  // local state rather than a route because the app has no router — every path already serves
  // this same shell (vercel.json rewrites everything but /api to index.html).
  const [signingIn, setSigningIn] = useState(false);

  // Drop a stale/invalid token (e.g. after a backend reset) so we don't get stuck.
  useEffect(() => {
    if (token && me === null) setToken(null);
  }, [token, me, setToken]);

  if (!token)
    return signingIn ? (
      <SignIn onBack={() => setSigningIn(false)} />
    ) : (
      <Landing onSignIn={() => setSigningIn(true)} />
    );
  if (me === undefined) return <div className="p-8 text-center text-loom-indigoSoft">…</div>;
  // A token that turns out to be dead drops straight to sign-in: she has used this before, so
  // the pitch is not what she needs.
  if (me === null) return <SignIn />;
  if (me.role === "provider") return <ProviderApp />;
  if (me.role === "customer") return <CustomerApp />;
  return <AdminApp />;
}
