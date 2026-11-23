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
export async function createSession(_uid, name) {
  const { data, error } = await supabase.rpc('create_session', { p_name: name });
  if (error) throw error;
  return data;
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
export async function joinSession(_uid, code, name) {
  const { error } = await supabase.rpc('join_session', { p_code: code, p_name: name });
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
