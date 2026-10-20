-- "طلب معلومات إضافية": a task can bounce back to whoever asked for it.
-- Enum values must be committed before use, so this lives in its own migration.
alter type public.task_status add value if not exists 'needs_info';
