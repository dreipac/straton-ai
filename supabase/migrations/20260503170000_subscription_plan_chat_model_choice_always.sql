-- Kein „festes“ Chat-Modell mehr pro Abo: Modellwahl im Composer bleibt frei;
-- OpenAI-Hauptchat wird nur noch über Tier 1 / Token-Budget / Tier 2 gesteuert.
update public.subscription_plans
set chat_allow_model_choice = true,
    default_chat_model_id = null;
