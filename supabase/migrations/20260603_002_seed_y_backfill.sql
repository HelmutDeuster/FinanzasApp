-- Migración 002: seed de tarjetas + backfill bank_source + sueldo de prueba
-- Autor: FinanzasApp · Sesión 06
--
-- CONTEXTO:
-- Las tablas credit_cards, user_settings y las columnas de transactions ya existen
-- (aplicadas en la migración 001). Este archivo:
--   a) Inserta las 2 tarjetas reales del usuario (idempotente por last_four)
--   b) Hace backfill de bank_source en las 113 transacciones open-banking que se
--      sincronizaron antes de que existiera la columna (datos de prueba)
--   c) Seedea estimated_salary para que el alert verde/ámbar/rojo tenga con qué comparar
--
-- TODO acotado al usuario h.deusterj@gmail.com — no toca al usuario test@test.com

-- ─── a) Tarjetas de crédito ────────────────────────────────────────────────────
-- Visa ****8335: cierre día 23, vencimiento día 6
-- Mastercard ****4421: cierre día 5, vencimiento día 20
INSERT INTO public.credit_cards (user_id, name, last_four, cycle_close_day, cycle_due_day, source)
SELECT
  u.id,
  v.name,
  v.last_four,
  v.close_day,
  v.due_day,
  'manual'
FROM auth.users u
CROSS JOIN (VALUES
  ('Visa',       '8335', 23, 6),
  ('Mastercard', '4421',  5, 20)
) AS v(name, last_four, close_day, due_day)
WHERE u.email = 'h.deusterj@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.credit_cards c
    WHERE c.user_id = u.id AND c.last_four = v.last_four
  );

-- ─── b) Backfill bank_source ───────────────────────────────────────────────────
-- Las transacciones importadas con open-banking antes de la migración 001 llegaron
-- sin bank_source. bchileSync.ts ya las mapea correctamente para syncs futuros.
-- Las marcamos como 'credit_card_unbilled' (tarjeta no facturada) para que el
-- Modo Tarjeta del Home pueda filtrarlas y mostrar montos reales.
-- Este cambio es reversible: un UPDATE a NULL deja todo como estaba.
UPDATE public.transactions
SET bank_source = 'credit_card_unbilled'
WHERE source = 'open-banking'
  AND bank_source IS NULL;

-- ─── c) Sueldo estimado de prueba ─────────────────────────────────────────────
-- Solo actúa si el campo está NULL (no sobreescribe si ya fue configurado por el usuario).
-- $2.100.000 es el valor del ejemplo en el doc UX/UI.
UPDATE public.user_settings us
SET estimated_salary = 2100000
FROM auth.users u
WHERE us.user_id = u.id
  AND u.email = 'h.deusterj@gmail.com'
  AND us.estimated_salary IS NULL;
