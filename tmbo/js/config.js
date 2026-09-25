// =====================================================================
//  TMBO configuration
//  Paste your own values below (see SETUP.md, Steps 3 and 6).
//  These values are SAFE to commit to GitHub: the publishable key only
//  works together with the Row Level Security rules in supabase/schema.sql.
//  NEVER put your secret / service_role key or VAPID private key here.
// =====================================================================

// Supabase > Project Settings > API Keys (or Data API) > Project URL
export const SUPABASE_URL = 'https://zfhupshmsajmcqyqzuul.supabase.co/rest/v1/';

// Supabase > Project Settings > API Keys > Publishable key (sb_publishable_...)
// Older projects: use the "anon public" key instead.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AmXaPCVMyGklQNtlbfGTTQ__xMpehR5';

// From tools/generate-vapid-keys.html (the PUBLIC key only). Leave as-is to skip push notifications.
export const VAPID_PUBLIC_KEY = 'BNeppV-6-A8_S330-RKleU7ey7njqF5HirOHBQEkWwe0GaCVTOIJ0YLZv8rU8IDe24rnZ4ohBqOjZMIWXFlmte0';

// Shown in Settings > About
export const APP_VERSION = '1.0.0';
