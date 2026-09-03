import { useEffect } from "react";
import { useAuth } from "./auth";
import { SignIn } from "./features/SignIn";
import { ProviderApp } from "./features/provider/ProviderApp";
import { CustomerApp } from "./features/customer/CustomerApp";
import { AdminApp } from "./features/admin/AdminApp";

export default function App() {
  const { token, setToken, me } = useAuth();

  // Drop a stale/invalid token (e.g. after a backend reset) so we don't get stuck.
  useEffect(() => {
    if (token && me === null) setToken(null);
  }, [token, me, setToken]);

  if (!token) return <SignIn />;
  if (me === undefined) return <div className="p-8 text-center text-loom-indigoSoft">…</div>;
  if (me === null) return <SignIn />;
  if (me.role === "provider") return <ProviderApp />;
  if (me.role === "customer") return <CustomerApp />;
  return <AdminApp />;
}
