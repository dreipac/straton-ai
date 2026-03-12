// @ts-expect-error - Deno URL import is resolved at function runtime.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
// @ts-expect-error - Deno URL import is resolved at function runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
}

type Provider = 'openai' | 'anthropic'

type InputMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeProvider(value: unknown): Provider {
  return value === 'anthropic' ? 'anthropic' : 'openai'
}

async function getProviderApiKey(
  provider: Provider,
): Promise<string> {
  const envKeyName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
  const apiKey = String(Deno.env.get(envKeyName) ?? '').trim()
  if (!apiKey) {
    throw new Error(`API Key fuer Provider "${provider}" ist nicht als Supabase Secret gesetzt.`)
  }

  return apiKey
}

async function callOpenAi(messages: InputMessage[], apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI Anfrage fehlgeschlagen (${response.status}).`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('OpenAI hat keine Antwort geliefert.')
  }

  return content
}

async function callAnthropic(messages: InputMessage[], apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 512,
      messages: messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      system:
        messages.find((message) => message.role === 'system')?.content ??
        'Du bist ein hilfreicher Assistent.',
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic Anfrage fehlgeschlagen (${response.status}).`)
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const content = data.content?.find((entry) => entry.type === 'text')?.text?.trim()
  if (!content) {
    throw new Error('Anthropic hat keine Antwort geliefert.')
  }

  return content
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase Umgebungsvariablen fehlen.' }, 500)
  }

  if (!authHeader) {
    return jsonResponse({ error: 'Nicht authentifiziert.' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Session ist ungueltig.' }, 401)
  }

  try {
    const body = (await req.json()) as {
      provider?: unknown
      messages?: unknown
    }
    const provider = normalizeProvider(body.provider)
    const inputMessages = Array.isArray(body.messages) ? body.messages : []

    const messages: InputMessage[] = inputMessages
      .map((message) => {
        const role = typeof message?.role === 'string' ? message.role : 'user'
        const content = typeof message?.content === 'string' ? message.content.trim() : ''
        if (!content) {
          return null
        }
        if (role !== 'user' && role !== 'assistant' && role !== 'system') {
          return null
        }
        return {
          role,
          content,
        } as InputMessage
      })
      .filter((entry): entry is InputMessage => entry !== null)

    if (messages.length === 0) {
      return jsonResponse({ error: 'Keine gueltigen Nachrichten uebermittelt.' }, 400)
    }

    const apiKey = await getProviderApiKey(provider)
    const assistantContent =
      provider === 'anthropic'
        ? await callAnthropic(messages, apiKey)
        : await callOpenAi(messages, apiKey)

    return jsonResponse({
      assistantMessage: {
        role: 'assistant',
        content: assistantContent,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Serverfehler.'
    return jsonResponse({ error: message }, 500)
  }
})