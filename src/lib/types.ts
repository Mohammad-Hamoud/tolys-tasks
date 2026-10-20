export type Role = 'admin' | 'member';
export type TaskStatus = 'open' | 'pending' | 'needs_info' | 'done';
export type EventKind =
  | 'created'
  | 'claimed'
  | 'closed'
  | 'rejected'
  | 'archived'
  | 'restored'
  | 'info_requested'
  | 'info_provided';

export interface Profile {
  id: string;
  display_name: string;
  role: Role;
}

export interface Task {
  id: number;
  title: string;
  created_by: string;
  assignee: string;
  requested_at: string;
  clock_started_at: string;
  created_at: string;
  status: TaskStatus;
  info_requested_at: string | null;
  info_question: string | null;
  done_claimed_at: string | null;
  completed_at: string | null;
  closed_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
}

export interface TaskEvent {
  id: number;
  task_id: number;
  actor: string;
  kind: EventKind;
  days: number;
  note: string | null;
  created_at: string;
}
