# Straton AI - KI-Chat Prototyp

React/TypeScript-Prototyp mit:
- Router-basierter App-Struktur
- vorbereiteter Supabase Auth (E-Mail/Passwort)
- mockbarem KI-Adapter (ohne API-Key startbar)

## Schnellstart

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment Variablen

In `.env`:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AI_PROVIDER=openai
```

- `VITE_AI_PROVIDER=openai` (oder `anthropic`) aktiviert die **Edge Function**: **Hauptchat** nutzt OpenAI, **Lernpfad** (Learn-Bereich) **Claude Sonnet**. Dafür in Supabase beide Secrets setzen: `OPENAI_API_KEY` und `ANTHROPIC_API_KEY`.
- `VITE_AI_PROVIDER=mock` startet ohne externe KI.

## Projektstruktur

```text
src/
  app/                    # Router + globale Provider
  pages/                  # Seiten (Login, Chat, Settings)
  features/
    chat/                 # Chat-Domain (types, hooks, services, components)
    auth/                 # Auth-Domain (context, services, components)
  integrations/
    ai/                   # KI-Provider Adapter (aktuell mock)
    supabase/             # Supabase Client
  config/                 # Env-Konfiguration
  shared/                 # Geteilte UI/Lib-Bausteine
```

## Supabase Setup (Auth)

1. In Supabase ein Projekt erstellen.
2. In **Authentication > Providers** den E-Mail/Passwort-Login aktivieren.
3. URL + Anon Key in `.env` eintragen.
4. Dev-Server neu starten.

## NPM Scripts

- `npm run dev` - lokaler Dev-Server
- `npm run build` - TypeScript Check + Production Build
- `npm run preview` - Build lokal testen
- `npm run lint` - ESLint

## Deploy auf GitHub Pages

1. Repository auf GitHub erstellen und den lokalen Stand nach `main` pushen.
2. In GitHub unter **Settings -> Pages** bei **Source** die Option **GitHub Actions** auswaehlen.
3. In GitHub unter **Settings -> Secrets and variables -> Actions** diese Repository-Secrets setzen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Push auf `main` startet automatisch den Workflow `.github/workflows/deploy-pages.yml`.
5. Nach erfolgreichem Run ist die Seite unter `https://<github-user>.github.io/<repo>/` erreichbar.

## KI-Keys vorbereiten (empfohlen)

1. In Supabase zu **Project Settings -> Edge Functions -> Secrets** gehen.
2. Für den üblichen Betrieb **beide** Secrets setzen: `OPENAI_API_KEY` (Chat) und `ANTHROPIC_API_KEY` (Lernpfad / Claude Sonnet). Optional: Secret `ANTHROPIC_MODEL` in der Edge Function (Standard im Code: `claude-sonnet-4-6`; ältere Sonnet-IDs sind oft deaktiviert).
3. In `.env` `VITE_AI_PROVIDER=openai` (oder `anthropic`, gleiche Bedeutung) — nicht `mock`.
4. Edge Function `chat-completion` deployen (oder lokal neu starten).
5. Chat verwenden - die Keys laufen serverseitig ueber Supabase Edge Functions.
