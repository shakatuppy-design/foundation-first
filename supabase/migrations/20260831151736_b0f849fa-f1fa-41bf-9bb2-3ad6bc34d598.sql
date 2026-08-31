REVOKE ALL ON FUNCTION public.log_pilot_lesson_review_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_lesson_reviews_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_lesson_review_events_append_only() FROM PUBLIC, anon, authenticated;