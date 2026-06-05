-- Migración 003: campos completos del scraper open-banking-chile
-- Fecha: Junio 2026 · Sesión 07
--
-- QUÉ HACE ESTA MIGRACIÓN:
--   a) Agrega installments, card_last_four y balance_after a transactions
--   b) Agrega cupos nacionales/USD y fechas de facturación a credit_cards
--   c) Crea tabla account_snapshots (historial del saldo CC)
--   d) Limpia las tarjetas ficticias insertadas en la migración 002
--   e) Backfill: extrae las cuotas embebidas en las notas y las mueve a installments
--   f) Agrega restricción única (user_id, last_four) en credit_cards para upsert


-- ─── a) Columnas nuevas en transactions ──────────────────────────────────────

-- Cuotas del movimiento: "02/06" = cuota 2 de 6, NULL = pago único (01/01)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS installments TEXT;

-- Últimos 4 dígitos de la tarjeta a la que pertenece el movimiento.
-- El scraper v2.1.2 no expone este dato por movimiento individual;
-- la columna existe para cuando la librería lo soporte.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS card_last_four TEXT;

-- Saldo de la cuenta corriente después del movimiento (0 en TC)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS balance_after NUMERIC(15, 2);

-- Índice para drill-down por tarjeta cuando card_last_four esté disponible
CREATE INDEX IF NOT EXISTS idx_transactions_card_last_four
  ON public.transactions(user_id, card_last_four)
  WHERE card_last_four IS NOT NULL;


-- ─── b) Columnas nuevas en credit_cards ──────────────────────────────────────

-- Cupo nacional (pesos chilenos)
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS used_clp       NUMERIC(15, 2);
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS available_clp  NUMERIC(15, 2);
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS total_clp      NUMERIC(15, 2);

-- Cupo internacional (USD — puede ser NULL si la tarjeta no tiene cupo USD)
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS used_usd       NUMERIC(10, 2);
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS available_usd  NUMERIC(10, 2);
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS total_usd      NUMERIC(10, 2);

-- Próxima fecha de facturación tal como devuelve el banco: "22 de junio"
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS next_billing_date TEXT;

-- Período de facturación: "Mayo 2026"
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS billing_period TEXT;

-- Timestamp de la última sincronización exitosa con open-banking
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Restricción única para poder hacer upsert por (user_id, last_four).
-- WHERE last_four IS NOT NULL: permite múltiples tarjetas manuales sin last_four.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_cards_user_last_four
  ON public.credit_cards(user_id, last_four)
  WHERE last_four IS NOT NULL;


-- ─── c) Tabla account_snapshots ──────────────────────────────────────────────
-- Registra el saldo de la cuenta corriente en cada sincronización.
-- Sirve para trazar la evolución del saldo en el tiempo (gráfica futura).

CREATE TABLE IF NOT EXISTS public.account_snapshots (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  balance    NUMERIC(15, 2) NOT NULL,
  synced_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.account_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus snapshots"
  ON public.account_snapshots FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Índice descendente: la query más común es "último saldo" o "últimos N snapshots"
CREATE INDEX IF NOT EXISTS idx_account_snapshots_user
  ON public.account_snapshots(user_id, synced_at DESC);


-- ─── d) Limpieza de tarjetas ficticias ───────────────────────────────────────
-- Las tarjetas ****8335 y ****4421 fueron insertadas como datos de prueba
-- en la migración 002. Las tarjetas reales del scraper las reemplazarán
-- mediante upsert en el próximo sync.

DELETE FROM public.credit_cards
WHERE last_four IN ('8335', '4421')
  AND user_id IN (
    SELECT id FROM auth.users WHERE email = 'h.deusterj@gmail.com'
  );


-- ─── e) Backfill: mover cuotas de las notas a la columna installments ─────────
-- Las transacciones sincronizadas antes de esta migración tenían el formato:
--   note = "HAVANNA CAFE [cuota 02/06]"
-- Ahora separamos: note = "HAVANNA CAFE", installments = "02/06"
-- Esto corrige la clave de deduplicación para que los re-syncs no generen duplicados.

UPDATE public.transactions
SET
  installments = (regexp_match(note, '\[cuota ([0-9]+/[0-9]+)\]'))[1],
  note         = trim(regexp_replace(note, '\s*\[cuota [0-9]+/[0-9]+\]', '', 'g'))
WHERE source = 'open-banking'
  AND note LIKE '%[cuota%'
  AND installments IS NULL;
