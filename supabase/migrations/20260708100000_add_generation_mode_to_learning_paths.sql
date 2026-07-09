-- Platzhalter-Modus für Lernpfade: 'ai' (Standard) oder 'placeholder' (Admin-Test ohne API-Kosten).
-- Der Modus wird beim Erstellen fixiert und steuert clientseitig, ob KI-Aufrufe durch Mock-Daten
-- ersetzt werden.
alter table public.learning_paths
  add column if not exists generation_mode text not null default 'ai';
