// Supabase client and email sign-in (magic link). Sign-in works in any browser, so data follows the person.
// supabase-js pinned to 2.45.4, loaded from jsdelivr (an allowed CDN).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CONFIG_READY } from './config.js';

export const supabase = CONFIG_READY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

let uid = null;
let email = null;

// Returns the signed-in user's id, or null. Anonymous users do not count: they cannot be found from another browser.
export async function ensureAuth() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (user && !user.is_anonymous) {
    uid = user.id;
    email = user.email || null;
    return uid;
  }
  uid = null;
  email = null;
  return null;
}

// Sends a one-time sign-in link to the email. Clicking it signs the person in on any device.
export async function sendMagicLink(address) {
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

// If this browser holds an anonymous account (created before email sign-in), returns its id. Otherwise null.
export async function anonymousUserId() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user && user.is_anonymous ? user.id : null;
}

// Attaches an email to the current anonymous account. The same account id keeps its sessions and answers.
// Supabase sends a confirmation link; opening it signs the person in as a normal email account.
export async function attachEmail(address) {
  const { error } = await supabase.auth.updateUser(
    { email: address },
    { emailRedirectTo: location.origin + location.pathname },
  );
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  uid = null;
  email = null;
}

// Fires once the person is signed in (including when they come back from the email link).
export function onSignedIn(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user && !session.user.is_anonymous && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      uid = session.user.id;
      email = session.user.email || null;
      callback(session.user);
    }
  });
}

export const currentUid = () => uid;
export const currentEmail = () => email;
