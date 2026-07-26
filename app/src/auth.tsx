import { createContext, useContext, useState, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Lang, makeT } from "./i18n";

type Me = ReturnType<typeof useQuery<typeof api.auth.me>>;

type AuthCtx = {
  token: string | null;
  setToken: (t: string | null) => void;
  me: Me;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: ReturnType<typeof makeT>;
};

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "loom.token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(KEY));
  const [lang, setLang] = useState<Lang>("en");
  const me = useQuery(api.auth.me, token ? { token } : "skip");

  const setToken = (t: string | null) => {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
    setTokenState(t);
  };

  return (
    <Ctx.Provider value={{ token, setToken, me, lang, setLang, t: makeT(lang) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
