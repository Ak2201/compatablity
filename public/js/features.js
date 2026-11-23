// Client calls for the feature set (migration 0010): invites with expiry, cancel, nicknames, snapshots,
// notifications, access log, and deleting your own data. All reads and writes go through the database rules.
import { supabase } from './supabase.js';

const CODE_RX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

// Accepts a bare code or a link with ?join=CODE. Returns the code or ''.
export function codeFromText(text) {
  const raw = String(text || '').trim();
  const fromLink = raw.includes('join=') ? raw.split('join=').pop().split('&')[0] : raw;
  const code = fromLink.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE_RX.test(code) ? code : '';
}

// Creates an invite with an optional message. Expires in 14 days (set by the database).
export async function createInviteWithMessage(message) {
  const { data, error } = await supabase.rpc('create_connection', { p_message: message || null });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { id: row.id, code: row.code, expiresAt: row.expires_at };
}

export async function cancelInvite(id) {
  const { error } = await supabase.rpc('cancel_invite', { p_id: id });
  if (error) throw error;
}

export async function setNickname(id, nickname) {
  const { error } = await supabase.rpc('set_nickname', { p_id: id, p_nickname: nickname || null });
  if (error) throw error;
}

// Connections with the extra fields from migration 0010 (nickname for your side, expiry).
export async function listConnectionsV2() {
  const { data, error } = await supabase.rpc('list_connections');
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    code: r.code,
    partnerName: r.partner_name,
    partnerGender: r.partner_gender,
    myGender: r.my_gender,
    myShare: !!r.my_share,
    partnerShare: !!r.partner_share,
    accepted: !!r.accepted,
    nickname: r.my_nickname || null,
    expiresAt: r.expires_at || null,
  }));
}

// Private snapshots of your own answers. Only you can read them.
export async function saveSnapshot(bank, label) {
  const { data, error } = await supabase.rpc('save_snapshot', { p_bank: bank, p_label: label || null });
  if (error) throw error;
  return data;
}

export async function listSnapshots(uid, bank) {
  const { data, error } = await supabase
    .from('profile_snapshots')
    .select('id, label, created_at, answers')
    .eq('user_id', uid)
    .eq('bank', bank)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listNotifications() {
  const { data, error } = await supabase.rpc('list_notifications');
  if (error) throw error;
  return (data || []).map((n) => ({ id: n.id, body: n.body, read: !!n.read_at, createdAt: n.created_at }));
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc('mark_all_read');
  if (error) throw error;
}

export async function listShareEvents(connectionId) {
  const { data, error } = await supabase.rpc('list_share_events', { p_id: connectionId });
  if (error) throw error;
  return data || [];
}

// Deletes your own answers, snapshots, notifications, and profile, and releases your connections
// (partners keep their own data). The auth account itself is removed by an admin, not from the app.
export async function deleteMyData() {
  const { error } = await supabase.rpc('delete_my_data');
  if (error) throw error;
}

// Downloads your own answers and snapshots as a JSON file.
export async function downloadMyData(uid) {
  const [{ data: answers }, { data: snaps }] = await Promise.all([
    supabase.from('profile_answers').select('bank, answers, updated_at').eq('user_id', uid),
    supabase.from('profile_snapshots').select('bank, label, created_at, answers').eq('user_id', uid),
  ]);
  const payload = { exportedAt: new Date().toISOString(), answers: answers || [], snapshots: snaps || [] };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-compatibility-data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
