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
const LANG_KEY = "loom.lang";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(KEY));

  // Malayalam by default, and remembered. This is a Malayalam-first product whose primary
  // users are Malayalam-speaking SHG members, but it opened in English on every load —
  // including for someone who had already switched, since the choice was never persisted.
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "en" || saved === "ml" ? saved : "ml";
  });
  const setLang = (l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  };
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

// Fast refresh wants a module to export only components, and this one also exports the hook
// that reads its context. Splitting them would create a second file existing only to satisfy a
// dev-server optimisation, so the rule is disabled here rather than obeyed.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
