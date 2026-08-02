import { createContext, useContext, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./lib/api";
import { Lang, makeT } from "./i18n";
import type { Provider, Customer } from "../api/_lib/mappers";

export type Me =
  | { role: "admin"; userId: string }
  | { role: "provider"; userId: string; provider: Provider }
  | { role: "customer"; userId: string; customer: Customer };

type AuthCtx = {
  token: string | null;
  setToken: (t: string | null) => void;
  me: Me | null | undefined;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: ReturnType<typeof makeT>;
};

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "loom.token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(KEY));
  const [lang, setLang] = useState<Lang>("en");
  const { data: me } = useQuery({
    queryKey: ["me", token],
    queryFn: () => apiGet<Me | null>("/api/auth/me", { token: token! }),
    enabled: !!token,
  });

  const setToken = (t: string | null) => {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
    setTokenState(t);
  };

  return (
    <Ctx.Provider value={{ token, setToken, me, lang, setLang, t: makeT(lang) }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
