-- Feedback-Eintraege loeschen: nur Superadmin

create policy "user_feedback_delete_superadmin"
  on public.user_feedback
  for delete
  to authenticated
  using (
    coalesce(
      (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
      false
    ) = true
  );
