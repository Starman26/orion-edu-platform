// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type AuthUser = {
  id: string;
  email?: string;
  [key: string]: any;
};

type AuthContextType = {
  user: AuthUser | null;
  userId: string | null;
  userEmail: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser | null>;
  signup: (email: string, password: string) => Promise<AuthUser | null>;
  loginWithGoogle: () => Promise<any>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** ---------------------------
 *  Cross-window leader lock
 *  --------------------------- */
const LOCK_KEY = "__CORA_SUPABASE_AUTH_LEADER__";
const LOCK_TTL_MS = 45_000; // leader expires if not renewed
const LOCK_RENEW_EVERY_MS = 20_000;

function getWindowId() {
  const k = "__CORA_WINDOW_ID__";
  const existing = sessionStorage.getItem(k);
  if (existing) return existing;
  const id = (crypto as any)?.randomUUID?.() ?? String(Math.random()).slice(2);
  sessionStorage.setItem(k, id);
  return id;
}

function tryAcquireLeaderLock(myId: string) {
  const now = Date.now();
  const raw = localStorage.getItem(LOCK_KEY);

  try {
    const lock = raw ? JSON.parse(raw) : null;
    if (!lock || typeof lock.expires !== "number" || lock.expires < now) {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ id: myId, expires: now + LOCK_TTL_MS }));
      return true;
    }
    return lock.id === myId;
  } catch {
    // if corrupted, overwrite
    localStorage.setItem(LOCK_KEY, JSON.stringify({ id: myId, expires: now + LOCK_TTL_MS }));
    return true;
  }
}

function renewLeaderLock(myId: string) {
  const now = Date.now();
  localStorage.setItem(LOCK_KEY, JSON.stringify({ id: myId, expires: now + LOCK_TTL_MS }));
}

/** ---------------------------
 *  Read session without network
 *  (so aux windows don't refresh)
 *  --------------------------- */
function getProjectRefFromUrl(supabaseUrl: string) {
  try {
    const u = new URL(supabaseUrl);
    return u.hostname.split(".")[0]; // <ref>.supabase.co
  } catch {
    return null;
  }
}

function readSessionFromStorage(): Session | null {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;

  const ref = getProjectRefFromUrl(url);
  if (!ref) return null;

  const key = `sb-${ref}-auth-token`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // supabase-js v2 usually stores currentSession
    const s =
      parsed?.currentSession ??
      parsed?.session ??
      parsed;

    return s ?? null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = user?.id ?? null;
  const userEmail = (user?.email as string | undefined) ?? null;

  useEffect(() => {
    const myId = getWindowId();

    // Detect aux windows more defensively (hash OR query param OR pathname hints)
    const hash = location.hash || "";
    const qp = new URLSearchParams(location.search || "");
    const win = (qp.get("win") || "").toLowerCase();

    const isAuxWindow =
      win === "widget" ||
      win === "toast" ||
      win === "answer" ||
      hash.startsWith("#/widget") ||
      hash.startsWith("#/toast") ||
      hash.startsWith("#/answer") ||
      location.pathname.includes("/widget") ||
      location.pathname.includes("/toast") ||
      location.pathname.includes("/answer");

    let unsub: { unsubscribe: () => void } | null = null;
    let leader = false;

    let renewTimer: number | null = null;
    let refreshTimer: number | null = null;

    // Always do a cheap local read first (no network)
    const boot = () => {
      const s = readSessionFromStorage();
      setUser((s?.user as AuthUser) ?? null);
      setLoading(false);
    };
    boot();

    // Aux windows: DO NOT call supabase.auth.getSession() (that can refresh)
    // They just listen for storage changes (leader will refresh & update storage)
    if (isAuxWindow) {
      const onStorage = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key.includes("-auth-token")) {
          const s = readSessionFromStorage();
          setUser((s?.user as AuthUser) ?? null);
        }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }

    // Main window: become leader (only ONE window should refresh)
    leader = tryAcquireLeaderLock(myId);

    // If we didn't get leadership, behave like aux: watch storage only
    if (!leader) {
      const onStorage = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key.includes("-auth-token")) {
          const s = readSessionFromStorage();
          setUser((s?.user as AuthUser) ?? null);
        }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }

    // Leader: keep lock alive
    renewLeaderLock(myId);
    renewTimer = window.setInterval(() => renewLeaderLock(myId), LOCK_RENEW_EVERY_MS);

    // Leader: now it's safe to do a real getSession (may refresh once if needed)
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error) setUser((data.session?.user as AuthUser) ?? null);
    })();

    // Leader: listen auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((session?.user as AuthUser) ?? null);
    });
    unsub = listener.subscription;

    // Leader: refresh near expiry, with backoff
    const gg = globalThis as any;
    gg.__CORA_REFRESH_INFLIGHT__ = false;
    gg.__CORA_REFRESH_NEXT_ALLOWED__ = 0;

    refreshTimer = window.setInterval(async () => {
      const nowMs = Date.now();
      if (gg.__CORA_REFRESH_INFLIGHT__) return;
      if (nowMs < (gg.__CORA_REFRESH_NEXT_ALLOWED__ || 0)) return;

      gg.__CORA_REFRESH_INFLIGHT__ = true;
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return;

        const expiresAt = session.expires_at ?? 0;
        const nowSec = Math.floor(nowMs / 1000);
        const secondsLeft = expiresAt - nowSec;

        if (secondsLeft > 120) return;

        const { error } = await supabase.auth.refreshSession();
        if (error) {
          gg.__CORA_REFRESH_NEXT_ALLOWED__ = Date.now() + 60_000;
        }
      } catch {
        gg.__CORA_REFRESH_NEXT_ALLOWED__ = Date.now() + 60_000;
      } finally {
        gg.__CORA_REFRESH_INFLIGHT__ = false;
      }
    }, 30_000);

    return () => {
      if (unsub) unsub.unsubscribe();
      if (renewTimer) window.clearInterval(renewTimer);
      if (refreshTimer) window.clearInterval(refreshTimer);
      // no necesitamos borrar el lock: si cierras, expira solo
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(data.user as AuthUser);
    return data.user as AuthUser;
  };

  const signup = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) setUser(data.user as AuthUser);
    return (data.user as AuthUser) ?? null;
  };

  const loginWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "cora://auth/callback",
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;

    const url = data?.url;
    if (!url) throw new Error("Supabase no devolvió la URL de OAuth.");

    window.fredie?.openExternal?.(url)
      ?? (window as any).electron?.ipcRenderer?.send?.("open:external", url)
      ?? window.open(url, "_blank", "noopener,noreferrer");

    return data;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, userId, userEmail, loading, login, signup, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
};
