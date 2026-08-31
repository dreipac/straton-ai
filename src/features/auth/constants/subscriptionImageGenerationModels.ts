/** In DB/Plan: snake_case — Edge Function `generate-chat-image` → OpenAI `gpt-image-*`. */
export type SubscriptionImageGenerationModelId = 'gpt_image_2' | 'gpt_image_1'

export const SUBSCRIPTION_IMAGE_GENERATION_MODELS: ReadonlyArray<{
  id: SubscriptionImageGenerationModelId
  label: string
}> = [
  { id: 'gpt_image_2', label: 'GPT Image 2 (OpenAI)' },
  { id: 'gpt_image_1', label: 'GPT Image 1 (OpenAI)' },
]

export function labelForSubscriptionImageGenerationModel(
  id: SubscriptionImageGenerationModelId | string | null | undefined,
): string {
  const row = SUBSCRIPTION_IMAGE_GENERATION_MODELS.find((m) => m.id === id)
  return row?.label ?? (id ? String(id) : '—')
}

export function parseSubscriptionImageGenerationModelId(
  raw: string | null | undefined,
): SubscriptionImageGenerationModelId {
  if (raw === 'gpt_image_2' || raw === 'gpt_image_1') {
    return raw
  }
  /* Legacy / Fremdwerte → günstigeres Modell */
  return 'gpt_image_1'
}
