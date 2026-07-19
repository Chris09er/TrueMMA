import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';
import { claimAnonymousFollows } from './pushSubscriptions';
import { claimLocalFavorites } from './favorites';
import { claimAnonymousOrganizationFollows } from './organizationFollows';
import { getProfile, updateTimezoneOverride } from './profile';

export type AuthResult = 'ok' | 'error';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  confirmPasswordReset: (email: string, token: string, newPassword: string) => Promise<AuthResult>;
  updateEmail: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  // null = device-local (default). Only ever set for logged-in users — see
  // docs/ARCHITECTURE.md, Timezone override.
  timezoneOverride: string | null;
  setTimezoneOverride: (timezone: string | null) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [timezoneOverride, setTimezoneOverrideState] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        getProfile(data.session.user.id)
          .then((profile) => setTimezoneOverrideState(profile?.timezone_override ?? null))
          .catch(() => {});
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_OUT') {
        setTimezoneOverrideState(null);
      }
      if (event === 'SIGNED_IN' && nextSession?.user) {
        getProfile(nextSession.user.id)
          .then((profile) => setTimezoneOverrideState(profile?.timezone_override ?? null))
          .catch(() => {});
        claimAnonymousFollows(nextSession.user.id).catch((err) => {
          console.error('claimAnonymousFollows failed:', err);
        });
        claimLocalFavorites(nextSession.user.id).catch((err) => {
          console.error('claimLocalFavorites failed:', err);
        });
        claimAnonymousOrganizationFollows(nextSession.user.id).catch((err) => {
          console.error('claimAnonymousOrganizationFollows failed:', err);
        });
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signUp: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return error ? 'error' : 'ok';
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? 'error' : 'ok';
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      requestPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        return error ? 'error' : 'ok';
      },
      confirmPasswordReset: async (email, token, newPassword) => {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'recovery',
        });
        if (verifyError) return 'error';

        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        return updateError ? 'error' : 'ok';
      },
      updateEmail: async (email) => {
        const { error } = await supabase.auth.updateUser({ email });
        return error ? 'error' : 'ok';
      },
      updatePassword: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        return error ? 'error' : 'ok';
      },
      timezoneOverride,
      setTimezoneOverride: async (timezone) => {
        if (!session?.user) return 'error';
        const result = await updateTimezoneOverride(session.user.id, timezone);
        if (result === 'ok') setTimezoneOverrideState(timezone);
        return result;
      },
    }),
    [session, loading, timezoneOverride]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
