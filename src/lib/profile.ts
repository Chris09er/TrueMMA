import { supabase } from './supabase';

export type Profile = {
  id: string;
  nickname: string | null;
  timezone_override: string | null;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, timezone_override')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export async function updateTimezoneOverride(userId: string, timezone: string | null): Promise<'ok' | 'error'> {
  const { error } = await supabase.from('profiles').update({ timezone_override: timezone }).eq('id', userId);
  return error ? 'error' : 'ok';
}

export type UpdateNicknameResult = 'ok' | 'taken' | 'error';

export async function updateNickname(userId: string, nickname: string): Promise<UpdateNicknameResult> {
  const { error } = await supabase.from('profiles').update({ nickname }).eq('id', userId);

  if (!error) return 'ok';
  // Postgres unique_violation
  if (error.code === '23505') return 'taken';
  return 'error';
}
