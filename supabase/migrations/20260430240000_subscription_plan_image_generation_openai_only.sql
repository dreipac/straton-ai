-- Nur noch OpenAI GPT Image 1 / 2 (Flux zunächst deaktiviert)

update public.subscription_plans
set image_generation_model = 'gpt_image_1'
where image_generation_model = 'flux';

alter table public.subscription_plans
  drop constraint if exists subscription_plans_image_generation_model_check;

alter table public.subscription_plans
  add constraint subscription_plans_image_generation_model_check check (
    image_generation_model in ('gpt_image_2', 'gpt_image_1')
  );

comment on column public.subscription_plans.image_generation_model is
  'Bildgenerator: gpt_image_2 oder gpt_image_1 (OpenAI Images API).';
