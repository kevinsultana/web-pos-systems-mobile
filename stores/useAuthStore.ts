import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import type { UserProfile, UserRole, PrismaRole } from '@/types';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

// Maps Prisma Role enum → mobile role string for tab routing
// ADMIN / SUPER_ADMIN → null (redirect to web app)
function toMobileRole(prismaRole: PrismaRole): UserRole | null {
  if (prismaRole === 'CASHIER') return 'cashier';
  if (prismaRole === 'USER') return 'user';
  return null; // ADMIN / SUPER_ADMIN → not available on mobile
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** ADMIN / SUPER_ADMIN should use the web app instead */
  shouldRedirectToWeb: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signOutAndClearSession: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,
  shouldRedirectToWeb: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        set({ session, user: session.user, isLoading: true });
        await get().fetchProfile();
      }
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      set({ isLoading: false });
    }

    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        set({ session, user: session.user, isAuthenticated: true });
        await get().fetchProfile();
      } else {
        set({
          session: null,
          user: null,
          profile: null,
          role: null,
          isAuthenticated: false,
        });
      }
    });
  },

  signIn: async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },

  signUp: async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return { error: error?.message ?? null };
  },

  signInWithGoogle: async () => {
    const redirectUrl = makeRedirectUri({ path: 'auth/callback' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    });

    if (error) {
      console.error('Google OAuth error:', error.message);
      return;
    }

    if (data?.url) {
      await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    }
  },

  signOutAndClearSession: async () => {
    await supabase.auth.signOut();
    set({
      session: null,
      user: null,
      profile: null,
      role: null,
      isAuthenticated: false,
      shouldRedirectToWeb: false,
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({
      session: null,
      user: null,
      profile: null,
      role: null,
      isAuthenticated: false,
      shouldRedirectToWeb: false,
    });
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;

    // Query the web app's "users" table (Prisma model)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Row not found — user signed up via Supabase Auth but no row in public.users yet.
        // The web app's trigger on_auth_user_created (or similar) should auto-create it.
        // Fallback to "user" role so the app isn't stuck.
        console.warn('No profile row in users table for', user.id);
        set({ isAuthenticated: true, role: 'user' });
      } else {
        console.error('Fetch profile error:', error.message);
        set({ isAuthenticated: true });
      }
      return;
    }

    const profile = data as UserProfile;
    const mobileRole = toMobileRole(profile.role);
    set({
      profile,
      role: mobileRole,
      shouldRedirectToWeb: mobileRole === null,
      isAuthenticated: true,
    });
  },
}));
