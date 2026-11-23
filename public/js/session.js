// Session lifecycle on Supabase. All writes go through database functions (RPCs);
// reads of the sessions table are limited to members by Row Level Security.
//
// A session, as the app sees it (same shape as before, so app.js stays simple):
//   status      'waiting_for_partner' | 'both_joined' | 'answering' | 'locked' | 'revealed'
//   memberUids  [uidA] or [uidA, uidB]
//   members     { [uid]: { name, role: 'A' | 'B' } }
import { supabase } from './supabase.js';

const CODE_LENGTH = 8;

// Accepts whatever came in the URL and returns a safe code or ''.
export function cleanCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export const linkFor = (code) => `${location.origin}${location.pathname}?join=${code}`;

// Creator: the database makes the code, so retries and collisions are handled server-side.
export async function createSession(_uid, name, gender) {
  const { data, error } = await supabase.rpc('create_session', { p_name: name, p_gender: gender });
  if (error) throw error;
  return data;
}

// ---- profile: display name and gender, one per account ----
export async function getProfile(uid) {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, gender')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data ? { display_name: data.display_name, gender: data.gender } : null;
}

export async function saveProfile(uid, { display_name, gender }) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: uid, display_name, gender, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

// Every session this account is in, newest first. RLS limits the rows to the ones you belong to.
export async function listMySessions(uid) {
  const { data, error } = await supabase
    .from('sessions')
    .select('code, status, member_a, member_a_name, member_a_gender, member_b, member_b_name, member_b_gender, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => {
    const isA = row.member_a === uid;
    return {
      code: row.code,
      status: row.status,
      role: isA ? 'A' : 'B',
      myName: isA ? row.member_a_name : row.member_b_name,
      myGender: isA ? row.member_a_gender : row.member_b_gender,
      partnerName: isA ? row.member_b_name : row.member_a_name,
      partnerGender: isA ? row.member_b_gender : row.member_a_gender,
    };
  });
}

// Before joining, the invitee sees only the host's first name and whether the seat is taken.
// Returns { hostName, isFull, isMember } or null if the code does not exist.
export async function previewSession(code) {
  const { data, error } = await supabase.rpc('session_preview', { p_code: code });
  if (error) throw error;
  if (!data) return null;
  return { hostName: data.host_name, isFull: data.is_full, isMember: data.is_member };
}

// Joiner. The database locks the row, so two people joining at once cannot both get the second seat.
export async function joinSession(_uid, code, name, gender) {
  const { error } = await supabase.rpc('join_session', { p_code: code, p_name: name, p_gender: gender });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('full')) throw Object.assign(new Error('full'), { code: 'app/full' });
    if (msg.includes('not_found')) throw Object.assign(new Error('not_found'), { code: 'app/not-found' });
    throw error;
  }
  return 'joined';
}

// Converts a database row into the shape app.js expects.
function toSession(row) {
  const members = { [row.member_a]: { name: row.member_a_name, role: 'A' } };
  const memberUids = [row.member_a];
  if (row.member_b) {
    members[row.member_b] = { name: row.member_b_name, role: 'B' };
    memberUids.push(row.member_b);
  }
  return { status: row.status, memberUids, members };
}

// Live updates. Calls back with a session, null (not found, or not a member), or { error }.
// Realtime respects RLS, so members get updates and everyone else gets nothing.
export function watchSession(code, callback) {
  let channel = null;
  let closed = false;

  supabase
    .from('sessions')
    .select('*')
    .eq('code', code)
    .maybeSingle()
    .then(({ data, error }) => {
      if (closed) return;
      if (error) return callback({ error: error.message });
      callback(data ? toSession(data) : null);
    });

  channel = supabase
    .channel(`session-${code}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `code=eq.${code}` },
      (payload) => { if (!closed) callback(toSession(payload.new)); })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') callback({ error: status });
    });

  return () => {
    closed = true;
    if (channel) supabase.removeChannel(channel);
  };
}

// ---- answers ----
// Your own row only. The database refuses to show your partner's row until the session is revealed.
export async function loadMyAnswers(code, uid) {
  const { data, error } = await supabase
    .from('answers')
    .select('answers, locked')
    .eq('session_code', code)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data; // null, or { answers, locked }
}

// Saves a draft. Refused by the database once your row is locked.
export async function saveMyAnswers(code, uid, answers) {
  const { error } = await supabase
    .from('answers')
    .upsert(
      { session_code: code, user_id: uid, answers, updated_at: new Date().toISOString() },
      { onConflict: 'session_code,user_id' },
    );
  if (error) throw error;
}

// Both rows. Only works once the session is revealed: before that, RLS returns just your own row.
export async function loadAllAnswers(code) {
  const { data, error } = await supabase
    .from('answers')
    .select('user_id, answers')
    .eq('session_code', code);
  if (error) throw error;
  return data || [];
}

// Final submit. Locks your row. Returns 'submitted', or 'locked' when both people have now locked.
export async function submitAnswers(code, answers) {
  const { data, error } = await supabase.rpc('submit_answers', { p_code: code, p_answers: answers });
  if (error) throw error;
  return data;
}
