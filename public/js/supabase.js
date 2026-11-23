// Supabase client and anonymous sign-in.
// supabase-js pinned to 2.45.4, loaded from jsdelivr (an allowed CDN).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CONFIG_READY } from './config.js';

export const supabase = CONFIG_READY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

let uid = null;

// Each device gets an anonymous user. The session is kept in this browser, so reloads reuse it.
// Anonymous sign-in must be enabled in Supabase (Authentication -> Sign In / Providers -> Anonymous).
export async function ensureAuth() {
  const { data: current } = await supabase.auth.getSession();
  if (current.session) {
    uid = current.session.user.id;
    return uid;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  uid = data.user.id;
  return uid;
}

export const currentUid = () => uid;
