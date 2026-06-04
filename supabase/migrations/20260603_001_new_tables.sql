-- Migración 001: tablas nuevas + columnas para UX/UI Sesión 05
-- Autor: FinanzasApp · Junio 2026

-- ─── Extensiones ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- para gen_random_bytes (share_token)

-- ─── 1. Columnas nuevas en transactions ──────────────────────────────────────
-- bank_source: distingue si el movimiento viene de cuenta corriente o tarjeta.
-- Es NULL para transacciones importadas antes de esta migración.
-- open-banking-chile devuelve: 'account' | 'credit_card_unbilled' | 'credit_card_billed'
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS bank_source TEXT
    CHECK (bank_source IN ('account', 'credit_card_unbilled', 'credit_card_billed'));

-- owner / split: para marcar si el gasto es propio, compartido o 100% de otra persona.
-- NULL equivale a 'me' (default implícito sin romper registros existentes).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT 'me'
    CHECK (owner IN ('me', 'split', 'other'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS split_amount NUMERIC(12, 2);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS split_person TEXT;

-- Índice: aceleran la query del ciclo TC (Modo Tarjeta del Home)
CREATE INDEX IF NOT EXISTS idx_transactions_bank_source
  ON public.transactions(user_id, bank_source, date);

-- ─── 2. credit_cards ─────────────────────────────────────────────────────────
-- Una fila por tarjeta de crédito del usuario.
-- cycle_close_day / cycle_due_day son configurables por el usuario en Ajustes.
-- Cuando open-banking sincroniza, crea/actualiza filas usando last_four.
CREATE TABLE IF NOT EXISTS public.credit_cards (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name             TEXT NOT NULL,                         -- editable: "Visa principal"
  last_four        TEXT,                                  -- "8335" — solo lectura si viene de open-banking
  cycle_close_day  INTEGER NOT NULL DEFAULT 23            -- día de cierre del ciclo (1–31)
    CHECK (cycle_close_day BETWEEN 1 AND 31),
  cycle_due_day    INTEGER NOT NULL DEFAULT 6             -- día de vencimiento del pago (1–31)
    CHECK (cycle_due_day BETWEEN 1 AND 31),
  active           BOOLEAN DEFAULT true,
  source           TEXT DEFAULT 'manual'
    CHECK (source IN ('open-banking', 'manual')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios gestionan sus tarjetas"
  ON public.credit_cards FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_credit_cards_user
  ON public.credit_cards(user_id, active);

-- ─── 3. debts ─────────────────────────────────────────────────────────────────
-- Una fila por cobro: "José debe $42.000 por Cena La Mar".
-- share_token es el identificador único para la URL pública de cobro.
CREATE TABLE IF NOT EXISTS public.debts (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
  person         TEXT NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL,
  paid           BOOLEAN DEFAULT false,
  paid_at        TIMESTAMPTZ,
  share_token    TEXT UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
-- El usuario accede a los cobros de sus propias transacciones
CREATE POLICY "Usuarios ven sus cobros"
  ON public.debts FOR ALL
  USING (
    transaction_id IN (
      SELECT id FROM public.transactions WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    transaction_id IN (
      SELECT id FROM public.transactions WHERE user_id = auth.uid()
    )
  );

-- Lectura pública para la página de cobro compartido (sin login)
CREATE POLICY "Lectura pública por token"
  ON public.debts FOR SELECT
  USING (true);

-- ─── 4. fixed_expenses ───────────────────────────────────────────────────────
-- Gastos fijos del ciclo para la proyección.
-- origin 'auto' = detectado automáticamente por la app.
-- origin 'manual' = ingresado por el usuario.
CREATE TABLE IF NOT EXISTS public.fixed_expenses (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL,
  origin     TEXT DEFAULT 'manual'
    CHECK (origin IN ('auto', 'manual')),
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios gestionan sus fijos"
  ON public.fixed_expenses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 5. user_settings ────────────────────────────────────────────────────────
-- Una fila por usuario. Se crea automáticamente la primera vez con defaults.
-- home_mode persiste el toggle Tarjeta / Cuenta entre sesiones.
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  default_close_day    INTEGER DEFAULT 23,              -- fallback si no hay tarjeta configurada
  default_due_day      INTEGER DEFAULT 6,
  estimated_salary     NUMERIC(12, 2),                  -- para proyecciones
  payment_rut          TEXT,                            -- datos bancarios del usuario (para cobros)
  payment_bank         TEXT,
  payment_account      TEXT,
  home_mode            TEXT DEFAULT 'credit_card'       -- 'credit_card' | 'checking'
    CHECK (home_mode IN ('credit_card', 'checking')),
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios gestionan sus ajustes"
  ON public.user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
