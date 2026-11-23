// Supabase project settings. Paste from: Supabase dashboard -> Project Settings -> API.
// The URL and anon key are public by design. Row Level Security (supabase/migrations) protects the data.
export const SUPABASE_URL = 'https://xnbntcbjqekzlvlrstjx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ZN3I1gFBH9FOnPcr3SZzSA_VCp9wtE0';

// The app shows a setup screen until both are filled in.
export const CONFIG_READY = !(SUPABASE_URL.startsWith('REPLACE_ME') || SUPABASE_ANON_KEY.startsWith('REPLACE_ME'));
