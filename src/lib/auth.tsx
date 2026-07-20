import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';
import { claimAnonymousFollows } from './pushSubscriptions';
import { claimLocalFavorites } from './favorites';
import { claimAnonymousOrganizationFollows } from './organizationFollows';
import { getProfile, updateTimezoneOverride } from './profile';
import type { Locale } from './translations';

export type AuthResult = { status: 'ok' } | { status: 'error'; code: string; message: string };

function toAuthResult(error: { message: string; code?: string; name?: string } | null): AuthResult {
  if (!error) return { status: 'ok' };
  // Network-level failures (no connection, request timed out) come back as
  // AuthRetryableFetchError with no `code` — give them their own code so the
  // UI can tell "offline" apart from "wrong credentials" instead of showing
  // the same generic message for both.
  const code = error.name === 'AuthRetryableFetchError' ? 'network_error' : (error.code ?? 'unknown');
  return { status: 'error', code, message: error.message };
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, locale: Locale) => Promise<AuthResult>;
  confirmSignup: (email: string, token: string) => Promise<AuthResult>;
  resendSignupConfirmation: (email: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  requestMagicLink: (email: string, locale: Locale) => Promise<AuthResult>;
  confirmMagicLink: (email: string, token: string) => Promise<AuthResult>;
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
      signUp: async (email, password, locale) => {
        // Stashed in user_metadata so a future server-side process (e.g. the
        // planned auth-email Edge Function, see docs/ARCHITECTURE.md) can
        // send the very first confirmation email in the right language —
        // there's no profile row yet at signup time to read it from.
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { locale } } });
        return toAuthResult(error);
      },
      confirmSignup: async (email, token) => {
        const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
        return toAuthResult(error);
      },
      resendSignupConfirmation: async (email) => {
        const { error } = await supabase.auth.resend({ type: 'signup', email });
        return toAuthResult(error);
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return toAuthResult(error);
      },
      requestMagicLink: async (email, locale) => {
        // shouldCreateUser: false — this is a login method for existing
        // accounts, not a second way to sign up (that stays through
        // signUp()/confirmSignup() so the password-policy/OTP-confirm flow
        // isn't bypassed).
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, data: { locale } },
        });
        return toAuthResult(error);
      },
      confirmMagicLink: async (email, token) => {
        const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
        return toAuthResult(error);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      requestPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        return toAuthResult(error);
      },
      confirmPasswordReset: async (email, token, newPassword) => {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'recovery',
        });
        if (verifyError) return toAuthResult(verifyError);

        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        return toAuthResult(updateError);
      },
      updateEmail: async (email) => {
        const { error } = await supabase.auth.updateUser({ email });
        return toAuthResult(error);
      },
      updatePassword: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        return toAuthResult(error);
      },
      timezoneOverride,
      setTimezoneOverride: async (timezone) => {
        if (!session?.user) return { status: 'error', code: 'not_authenticated', message: 'No session' };
        const result = await updateTimezoneOverride(session.user.id, timezone);
        if (result === 'ok') setTimezoneOverrideState(timezone);
        return result === 'ok' ? { status: 'ok' } : { status: 'error', code: 'unknown', message: 'Failed to update timezone' };
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
