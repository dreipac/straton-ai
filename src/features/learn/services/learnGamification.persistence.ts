import { getSupabaseClient } from '../../../integrations/supabase/client'

export type LearnGamificationProfile = {
  totalXp: number
  currentStreakDays: number
  longestStreakDays: number
  earnedBadgeIds: string[]
}

const EMPTY_PROFILE: LearnGamificationProfile = {
  totalXp: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
  earnedBadgeIds: [],
}

function toReadableError(error: unknown): Error {
  if (!error || typeof error !== 'object') {
    return new Error('Unbekannter Supabase-Fehler.')
  }
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
  const parts = [
    typeof candidate.message === 'string' ? candidate.message : '',
    typeof candidate.details === 'string' ? candidate.details : '',
    typeof candidate.hint === 'string' ? candidate.hint : '',
    typeof candidate.code === 'string' ? `Code: ${candidate.code}` : '',
  ].filter(Boolean)
  return new Error(parts.join(' | ') || 'Supabase-Anfrage fehlgeschlagen.')
}

/** Lädt das kontoweite Gamification-Profil (XP/Streak/Badges). Kein Eintrag = frischer Nutzer, Default-Werte. */
export async function fetchMyGamificationProfile(userId: string): Promise<LearnGamificationProfile> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('learn_gamification_profiles')
    .select('total_xp, current_streak_days, longest_streak_days, earned_badge_ids')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw toReadableError(error)
  }
  if (!data) {
    return { ...EMPTY_PROFILE }
  }
  return {
    totalXp: typeof data.total_xp === 'number' ? data.total_xp : 0,
    currentStreakDays: typeof data.current_streak_days === 'number' ? data.current_streak_days : 0,
    longestStreakDays: typeof data.longest_streak_days === 'number' ? data.longest_streak_days : 0,
    earnedBadgeIds: Array.isArray(data.earned_badge_ids)
      ? data.earned_badge_ids.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

export type RecordGamificationEventResult = {
  totalXp: number
  currentStreakDays: number
  longestStreakDays: number
  /** false = Dedupe-Treffer, Ereignis war bereits gebucht — kein erneutes XP/Streak-Update. */
  awarded: boolean
}

/**
 * Bucht ein XP-Ereignis atomar und idempotent (server-seitige Dedupe über `dedupeKey`).
 * `dedupeKey` muss pro einzigartiger Aktion stabil sein, z. B. `${pathId}:chapter-step:${stepId}`,
 * damit ein erneutes Auswerten derselben Antwort (Re-Render, Reload) kein doppeltes XP vergibt.
 */
export async function recordGamificationEvent(args: {
  userId: string
  dedupeKey: string
  eventType: string
  xpAmount: number
  sourcePathId?: string
}): Promise<RecordGamificationEventResult> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('learn_gamification_record_event', {
    p_user_id: args.userId,
    p_dedupe_key: args.dedupeKey,
    p_event_type: args.eventType,
    p_xp_amount: args.xpAmount,
    p_source_path_id: args.sourcePathId ?? null,
  })

  if (error) {
    throw toReadableError(error)
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    totalXp: typeof row?.total_xp === 'number' ? row.total_xp : 0,
    currentStreakDays: typeof row?.current_streak_days === 'number' ? row.current_streak_days : 0,
    longestStreakDays: typeof row?.longest_streak_days === 'number' ? row.longest_streak_days : 0,
    awarded: row?.awarded === true,
  }
}

export type AwardGamificationBadgeResult = {
  earnedBadgeIds: string[]
  newlyAwarded: boolean
}

/** Vergibt ein Achievement idempotent (kein Effekt, wenn bereits vorhanden). */
export async function awardGamificationBadge(args: {
  userId: string
  badgeId: string
}): Promise<AwardGamificationBadgeResult> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('learn_gamification_award_badge', {
    p_user_id: args.userId,
    p_badge_id: args.badgeId,
  })

  if (error) {
    throw toReadableError(error)
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    earnedBadgeIds: Array.isArray(row?.earned_badge_ids)
      ? row.earned_badge_ids.filter((id: unknown): id is string => typeof id === 'string')
      : [],
    newlyAwarded: row?.newly_awarded === true,
  }
}
