import type { Translations } from './i18n';

// Single source of truth for the password rules — must match
// supabase/config.toml's `minimum_password_length` / `password_requirements`
// (currently 8 / "letters_digits") so the client-side checklist and
// pre-submit check never disagree with what the server actually enforces.
// If either changes, update both, and the dashboard settings on both
// Supabase projects (see docs/ARCHITECTURE.md, Login / Profile).
export const MIN_PASSWORD_LENGTH = 8;

type PasswordRequirement = {
  key: 'minLength' | 'hasLetter' | 'hasDigit';
  labelKey: keyof Translations['auth'];
  test: (password: string) => boolean;
};

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { key: 'minLength', labelKey: 'passwordReqMinLength', test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { key: 'hasLetter', labelKey: 'passwordReqLetter', test: (p) => /[a-zA-Z]/.test(p) },
  { key: 'hasDigit', labelKey: 'passwordReqDigit', test: (p) => /[0-9]/.test(p) },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(password));
}
