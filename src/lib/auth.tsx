import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getQueryParams } from './oauthRedirect';
import { supabase } from './supabase';
import { claimSavesForUser } from './saves';
import { getProfile, updateTimezoneOverride } from './profile';
import type { Locale } from './translations';

// Required once at module load so the in-app browser used for
// signInWithGoogle() correctly dismisses itself after the OAuth redirect.
WebBrowser.maybeCompleteAuthSession();

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
  signInWithGoogle: () => Promise<AuthResult>;
  signInWithApple: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  confirmPasswordReset: (email: string, token: string, newPassword: string) => Promise<AuthResult>;
  updateEmail: (email: string) => Promise<AuthResult>;
  confirmEmailChange: (newEmail: string, token: string) => Promise<AuthResult>;
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
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session?.user) {
          getProfile(data.session.user.id)
            .then((profile) => setTimezoneOverrideState(profile?.timezone_override ?? null))
            .catch(() => {});
        }
      })
      // If reading the persisted session ever rejects (e.g. an AsyncStorage
      // failure), still drop out of the loading state — otherwise ProfileScreen
      // is stuck on its spinner forever with no way forward.
      .finally(() => setLoading(false));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_OUT') {
        setTimezoneOverrideState(null);
      }
      if (event === 'SIGNED_IN' && nextSession?.user) {
        getProfile(nextSession.user.id)
          .then((profile) => setTimezoneOverrideState(profile?.timezone_override ?? null))
          .catch(() => {});
        // Attaches this device's anonymous saved_* rows to the account
        // (user_id derived server-side from auth.uid()) so they become the
        // account's cross-device merkliste. No-op if nothing is saved.
        claimSavesForUser().catch((err) => {
          console.error('claimSavesForUser failed:', err);
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
      signInWithGoogle: async () => {
        // Needs a real Google Cloud Console OAuth client (external, user-only
        // setup — see docs/ARCHITECTURE.md) and [auth.external.google] set up
        // on both Supabase projects before this can succeed; the code path
        // itself works without either.
        const redirectTo = Linking.createURL('auth-callback');
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) return toAuthResult(error);
        if (!data.url) return { status: 'error', code: 'unknown', message: 'No OAuth URL returned' };

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') {
          return { status: 'error', code: 'oauth_cancelled', message: 'Login cancelled' };
        }

        const { params, errorCode } = getQueryParams(result.url);
        if (errorCode) return { status: 'error', code: errorCode, message: errorCode };
        if (!params.access_token || !params.refresh_token) {
          return { status: 'error', code: 'unknown', message: 'No session tokens in redirect URL' };
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        return toAuthResult(sessionError);
      },
      signInWithApple: async () => {
        // Native Sign in with Apple — iOS only (no-op button on Android, see
        // ProfileScreen.tsx's AppleAuthentication.isAvailableAsync() check).
        // Needs a real Apple Developer Services ID/key and
        // [auth.external.apple] set up on both Supabase projects before this
        // can succeed; this project has no iOS build yet either way.
        let credential;
        try {
          credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          });
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code === 'ERR_REQUEST_CANCELED') {
            return { status: 'error', code: 'oauth_cancelled', message: 'Login cancelled' };
          }
          return { status: 'error', code: 'unknown', message: (error as Error).message };
        }
        if (!credential.identityToken) {
          return { status: 'error', code: 'unknown', message: 'No identity token returned' };
        }
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
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

        // verifyOtp('recovery') already established a real session. If setting the
        // new password fails, tear that session down again so the user isn't left
        // silently logged in with the OLD password while seeing an error — sign in
        // is meant to happen via the new password, not the recovery code.
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
          await supabase.auth.signOut();
          return toAuthResult(updateError);
        }
        return toAuthResult(null);
      },
      updateEmail: async (email) => {
        // Does NOT change the address yet — Auth emails a confirmation code to
        // the new address and only applies the change once it's verified via
        // confirmEmailChange() below. The send goes through the auth-email Edge
        // Function's `email_change` template (see
        // supabase/functions/send-auth-email/index.ts).
        const { error } = await supabase.auth.updateUser({ email });
        return toAuthResult(error);
      },
      confirmEmailChange: async (newEmail, token) => {
        // `email_change` verifies against the *new* address — that's where the
        // code was sent. On success the session's user.email is updated and
        // onAuthStateChange fires, so the profile screen picks it up on its own.
        const { error } = await supabase.auth.verifyOtp({
          email: newEmail,
          token,
          type: 'email_change',
        });
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
