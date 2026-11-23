// Connections on Supabase: each person's saved answers (per bank), invites, sharing, and pair results.
// Own-row reads and writes go to profile_answers directly. Anything about another person goes through RPCs.
// Pure pairing and ranking live in rankings.js and are re-exported here.
import { supabase } from './supabase.js';

export { computePair, buildRankings, pendingList } from './rankings.js';

const BANKS = ['couple', 'friendship', 'self', 'wellbeing'];

// ---- own answers ----

// The caller's saved answers for both banks: { couple: {...}|null, friendship: {...}|null }.
export async function loadMyProfileAnswers(uid) {
  const { data, error } = await supabase
    .from('profile_answers')
    .select('bank, answers')
    .eq('user_id', uid);
  if (error) throw error;
  const out = { couple: null, friendship: null };
  for (const row of data || []) {
    if (BANKS.includes(row.bank)) out[row.bank] = row.answers || null;
  }
  return out;
}

export async function saveMyProfileAnswers(uid, bank, answers) {
  if (!BANKS.includes(bank)) throw Object.assign(new Error('bad bank'), { code: 'app/bad-bank' });
  const { error } = await supabase
    .from('profile_answers')
    .upsert(
      { user_id: uid, bank, answers, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,bank' },
    );
  if (error) throw error;
}

// ---- invites ----

// Host: creates a connection and gets its code.
export async function createInvite() {
  const { data, error } = await supabase.rpc('create_connection');
  if (error) throw error;
  return { id: data.id, code: data.code };
}

// Invitee: the host's first name and whether the seat is taken. null when the code does not exist.
export async function previewInvite(code) {
  const { data, error } = await supabase.rpc('connection_preview', { p_code: code });
  if (error) throw error;
  if (!data) return null;
  return {
    hostName: data.host_name,
    hostGender: data.host_gender,
    isFull: data.is_full,
    isMember: data.is_member,
  };
}

// Invitee: joins with the code. Returns the connection id.
export async function acceptInvite(code) {
  const { data, error } = await supabase.rpc('accept_connection', { p_code: code });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('own_connection')) throw Object.assign(new Error('own_connection'), { code: 'app/own' });
    if (msg.includes('full')) throw Object.assign(new Error('full'), { code: 'app/full' });
    if (msg.includes('not_found')) throw Object.assign(new Error('not_found'), { code: 'app/not-found' });
    if (msg.includes('not_signed_in')) throw Object.assign(new Error('not_signed_in'), { code: 'app/not-signed-in' });
    throw error;
  }
  return data;
}

// ---- list and sharing ----

// My connections, mapped to camelCase.
export async function listConnections() {
  const { data, error } = await supabase.rpc('list_connections');
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    code: row.code,
    partnerName: row.partner_name,
    partnerGender: row.partner_gender,
    myGender: row.my_gender,
    myShare: !!row.my_share,
    partnerShare: !!row.partner_share,
    accepted: !!row.accepted,
  }));
}

export async function setSharing(id, share) {
  const { error } = await supabase.rpc('set_connection_sharing', { p_id: id, p_share: !!share });
  if (error) throw error;
}

// Both people's answers for one bank: { mine, theirs }. null when the database says sharing is off
// (its error contains 'not_shared'). Any other error is rethrown.
export async function getConnectionAnswers(id, bank) {
  const { data, error } = await supabase.rpc('connection_answers', { p_id: id, p_bank: bank });
  if (error) {
    if ((error.message || '').includes('not_shared')) return null;
    throw error;
  }
  if (!data) return null;
  return { mine: data.mine ?? null, theirs: data.theirs ?? null };
}
