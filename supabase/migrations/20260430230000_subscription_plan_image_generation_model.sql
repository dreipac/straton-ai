-- Pro Abo: welcher Bildgenerator (OpenAI GPT Image 1/2 oder Flux) — Max. Bilder/Tag bleibt max_images + subscription_usages.used_images

alter table public.subscription_plans
  add column if not exists image_generation_model text not null default 'gpt_image_1';

alter table public.subscription_plans
  drop constraint if exists subscription_plans_image_generation_model_check;

alter table public.subscription_plans
  add constraint subscription_plans_image_generation_model_check check (
    image_generation_model in ('gpt_image_2', 'gpt_image_1', 'flux')
  );

comment on column public.subscription_plans.image_generation_model is
  'Bildgenerator fuer dieses Abo: gpt_image_2, gpt_image_1 (OpenAI Image API), flux (z. B. BFL).';
