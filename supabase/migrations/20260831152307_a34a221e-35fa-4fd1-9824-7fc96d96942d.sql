CREATE OR REPLACE FUNCTION public.pilot_lesson_review_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- History is never editable, for anyone.
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Lesson review history is append-only';
  END IF;
  -- Deletion is blocked for every application role. Only the platform-level
  -- roles can remove history, and only as a cascade of record removal.
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'Lesson review history is append-only';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.pilot_lesson_review_events_append_only() FROM PUBLIC, anon, authenticated;