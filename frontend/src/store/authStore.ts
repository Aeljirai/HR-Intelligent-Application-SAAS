import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type { Profile } from '@/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  status: 'loading' | 'signed_out' | 'signed_in';
  error: string | null;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, department_id, avatar_url')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as Profile;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  status: 'loading',
  error: null,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const profile = await loadProfile(data.session.user.id);
      set({ session: data.session, profile, status: 'signed_in' });
    } else {
      set({ status: 'signed_out' });
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const profile = await loadProfile(session.user.id);
        set({ session, profile, status: 'signed_in' });
      } else {
        set({ session: null, profile: null, status: 'signed_out' });
      }
    });
  },

  signIn: async (email, password) => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) set({ error: error.message });
  },

  signUp: async (email, password, fullName) => {
    set({ error: null });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: 'employee' } },
    });
    if (error) set({ error: error.message });
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },
}));
