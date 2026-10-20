import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';
import type { Task } from './types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tolys-tasks-auth' },
});

/** Every write goes through these RPCs; the database decides who may do what. */
async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendlyError(error.message));
  return data as T;
}

export const api = {
  addTask: (title: string, requestedAt: string | null) =>
    call<Task>('add_task', { p_title: title, p_requested_at: requestedAt }),
  claimDone: (id: number) => call<Task>('claim_done', { p_task_id: id }),
  closeTask: (id: number) => call<Task>('close_task', { p_task_id: id }),
  rejectDone: (id: number, note: string | null) => call<Task>('reject_done', { p_task_id: id, p_note: note }),
  archiveTask: (id: number, reason: string | null) => call<Task>('archive_task', { p_task_id: id, p_reason: reason }),
  restoreTask: (id: number) => call<Task>('restore_task', { p_task_id: id }),
  requestInfo: (id: number, question: string) => call<Task>('request_info', { p_task_id: id, p_question: question }),
  provideInfo: (id: number, answer: string) => call<Task>('provide_info', { p_task_id: id, p_answer: answer }),
};

export function friendlyError(message: string): string {
  if (/Invalid login credentials/i.test(message)) return 'كلمة المرور غلط 🙈';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'ما فيه اتصال بالإنترنت';
  if (/JWT|expired/i.test(message)) return 'انتهت الجلسة، سجّل دخول من جديد';
  // Our RPCs already raise Arabic messages.
  return /[؀-ۿ]/.test(message) ? message : `صار خطأ: ${message}`;
}
