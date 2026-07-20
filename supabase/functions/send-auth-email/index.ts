// Supabase Auth "Send Email" Hook — intercepts every outgoing auth email
// (signup confirmation, password recovery, etc.) so it can be sent in the
// user's own language instead of Supabase's per-*project* (not per-user)
// dashboard templates. See docs/ARCHITECTURE.md's "Auth emails" section for
// the full architecture writeup and the decisions behind it (direct IONOS
// SMTP, not a transactional API; OTP-code-based signup confirmation).
//
// Deployed and enabled on both stage and production (2026-07-20). Confirmed
// working end-to-end on stage. Still failing on production with a generic
// 500 — see docs/ARCHITECTURE.md's "Auth emails" section for the full
// debugging trail and what to check first (the console.log/console.error
// calls below were added specifically to diagnose this and haven't been
// reviewed in the Function logs yet).
//
// Scope, deliberately narrow for this first pass: only `signup` and
// `recovery` email_action_types are handled (both OTP-code-based — see
// src/lib/auth.tsx's confirmPasswordReset for the existing recovery flow;
// signup becomes OTP-based the same way once this ships, planned
// separately). Any other action type (email_change, invite, ...) returns an
// error rather than silently sending nothing or falling back — Supabase
// logs that as a failed send, which is more honest than a fake success.

import { Webhook } from 'npm:standardwebhooks@1.0.0';
// denomailer isn't published to npm — it's a deno.land/x-only module.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

type Locale = 'de' | 'en';

type HookPayload = {
  user: {
    email: string;
    user_metadata?: { locale?: string };
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
};

// Mirrors src/lib/translations.ts's DEFAULT_LOCALE and SUPPORTED_LOCALES —
// keep in sync if a language is ever added there.
function resolveLocale(raw: string | undefined): Locale {
  return raw === 'en' ? 'en' : 'de';
}

const templates: Record<Locale, Record<string, (token: string) => { subject: string; text: string }>> = {
  de: {
    signup: (token) => ({
      subject: 'Bestätige dein True MMA Konto',
      text: `Willkommen bei True MMA!\n\nDein Bestätigungscode lautet: ${token}\n\nGib diesen Code in der App ein, um dein Konto zu bestätigen.`,
    }),
    recovery: (token) => ({
      subject: 'Passwort zurücksetzen — True MMA',
      text: `Dein Code zum Zurücksetzen des Passworts lautet: ${token}\n\nGib diesen Code in der App ein, um ein neues Passwort zu setzen. Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.`,
    }),
  },
  en: {
    signup: (token) => ({
      subject: 'Confirm your True MMA account',
      text: `Welcome to True MMA!\n\nYour confirmation code is: ${token}\n\nEnter this code in the app to confirm your account.`,
    }),
    recovery: (token) => ({
      subject: 'Reset your password — True MMA',
      text: `Your password reset code is: ${token}\n\nEnter this code in the app to set a new password. If you didn't request this, you can safely ignore this email.`,
    }),
  },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('not allowed', { status: 400 });
  }

  const hookSecret = (Deno.env.get('SEND_AUTH_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  let data: HookPayload;
  try {
    data = wh.verify(payload, headers) as HookPayload;
  } catch (error) {
    console.error('Webhook signature verification failed:', (error as Error).message);
    return new Response(JSON.stringify({ error: { message: (error as Error).message } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { user, email_data } = data;
  const locale = resolveLocale(user.user_metadata?.locale);
  const templateFn = templates[locale][email_data.email_action_type];

  if (!templateFn) {
    console.error(`No template for email_action_type "${email_data.email_action_type}"`);
    return new Response(
      JSON.stringify({ error: { message: `No template for email_action_type "${email_data.email_action_type}"` } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { subject, text } = templateFn(email_data.token);

  const smtpUser = Deno.env.get('IONOS_SMTP_USER') ?? '';
  const smtpPassword = Deno.env.get('IONOS_SMTP_PASSWORD') ?? '';
  console.log(`SMTP config check: user=${smtpUser ? 'set (' + smtpUser.length + ' chars)' : 'MISSING'}, password=${smtpPassword ? 'set (' + smtpPassword.length + ' chars)' : 'MISSING'}`);

  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.ionos.de',
      port: 465,
      tls: true,
      auth: {
        username: smtpUser,
        password: smtpPassword,
      },
    },
  });

  try {
    await client.send({
      from: 'True MMA <noreply@true-mma.com>',
      to: user.email,
      subject,
      content: text,
    });
  } catch (error) {
    console.error('SMTP send failed:', (error as Error).message, (error as Error).stack);
    return new Response(JSON.stringify({ error: { message: `SMTP send failed: ${(error as Error).message}` } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await client.close();
  }

  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
