// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   Env
   ========================================================= */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/* =========================================================
   Ventana auxiliar
   - Widget/Toast/Answer no deberían manejar sesión ni refrescar tokens
   ========================================================= */
const isAuxWindow =
  typeof window !== "undefined" &&
  (location.hash.startsWith("#/widget") ||
    location.hash.startsWith("#/toast") ||
    location.hash.startsWith("#/answer"));

/* =========================================================
   Cliente Supabase
   - En aux: no persistir sesión y no auto-refresh
   - En main: comportamiento normal
   - detectSessionInUrl: false porque tu OAuth lo manejas por deep link
   ========================================================= */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: !isAuxWindow,
    autoRefreshToken: !isAuxWindow,
    detectSessionInUrl: false,
  },
});
