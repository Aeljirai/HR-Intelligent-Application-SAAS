import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Copy frontend/.env.example to frontend/.env.local and fill them in.'
  );
}

/**
 * The ONLY place in the frontend that talks to Supabase directly is
 * authentication (sign in / sign up / session refresh). All application
 * data goes through the Express API (see lib/apiClient.ts), which applies
 * its own role checks server-side. This keeps the trust boundary simple:
 * the browser only ever holds the low-privilege anon key.
 */
export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
});
