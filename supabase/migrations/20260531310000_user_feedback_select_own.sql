-- Nutzer dürfen eigene Feedbacks lesen (INSERT … RETURNING / display_id nach Absenden).
-- Bisher: nur Superadmin (alle) oder eigene bereits erledigte Zeilen → Absenden schlug fehl.

create policy "user_feedback_select_own"
  on public.user_feedback
  for select
  to authenticated
  using (user_id = (select auth.uid()));
