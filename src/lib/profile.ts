import { supabase } from './supabase';

export type Profile = {
  id: string;
  nickname: string | null;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export type UpdateNicknameResult = 'ok' | 'taken' | 'error';

export async function updateNickname(userId: string, nickname: string): Promise<UpdateNicknameResult> {
  const { error } = await supabase.from('profiles').update({ nickname }).eq('id', userId);

  if (!error) return 'ok';
  // Postgres unique_violation
  if (error.code === '23505') return 'taken';
  return 'error';
}
