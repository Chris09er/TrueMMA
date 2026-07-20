import type { Translations } from './i18n';

// Maps Supabase Auth error codes (https://supabase.com/docs/guides/auth/debugging/error-codes)
// to a specific t.auth.* message, so the UI can tell a wrong password apart
// from an unconfirmed email or a rate limit instead of one generic alert.
const ERROR_CODE_KEYS: Record<string, keyof Translations['auth']> = {
  invalid_credentials: 'errorInvalidCredentials',
  email_not_confirmed: 'errorEmailNotConfirmed',
  over_email_send_rate_limit: 'errorRateLimit',
  over_request_rate_limit: 'errorRateLimit',
  user_already_exists: 'errorUserAlreadyExists',
  weak_password: 'errorWeakPassword',
};

export function authErrorMessage(t: Translations, code: string): string {
  const key = ERROR_CODE_KEYS[code];
  return key ? (t.auth[key] as string) : t.auth.errorBody;
}
