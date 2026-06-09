// server/bchileSync.ts
// Adaptador entre open-banking-chile v3 y el formato de FinanzasApp.
// También hace upsert de credit_cards y snapshots de saldo directamente en Supabase
// usando service_role (requiere SUPABASE_SERVICE_ROLE_KEY en .env.local).

import { bchile } from 'open-banking-chile';
import type { BankMovement, CreditCardBalance, ScrapeResult } from 'open-banking-chile';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TransaccionParaGuardar } from '../types';

// ─── Tipo de retorno ──────────────────────────────────────────────────────────

export interface ResultadoSync {
  movimientos: Omit<TransaccionParaGuardar, 'user_id'>[];
}

// ─── Conversión de fecha ──────────────────────────────────────────────────────
// open-banking-chile devuelve "dd-mm-yyyy"; Supabase necesita "yyyy-mm-dd"
function convertirFecha(fechaBanco: string): string {
  const [dia, mes, anio] = fechaBanco.split('-');
  return `${anio}-${mes}-${dia}`;
}

// ─── Extraer últimos 4 dígitos ────────────────────────────────────────────────
// "Visa ****8335" → "8335"
function extraerLastFour(label: string): string | null {
  const match = label.match(/\*{4}(\d{4})/);
  return match ? match[1] : null;
}

// ─── Monto por cuota ──────────────────────────────────────────────────────────
// El scraper devuelve el monto total de la compra, no la cuota mensual.
// "01/05" → dividir entre 5. "01/01" o null → pago único, monto completo.
function montoPorCuota(amount: number, installments: string | null): number {
  if (!installments || installments === '01/01') return Math.abs(amount);
  const total = parseInt(installments.split('/')[1]);
  return isNaN(total) || total <= 0 ? Math.abs(amount) : Math.round(Math.abs(amount) / total);
}

// ─── Conversión de movimiento ─────────────────────────────────────────────────
// cardLastFour: null para cuenta corriente, string para TC
function convertirMovimiento(
  mov: BankMovement,
  cardLastFour: string | null
): Omit<TransaccionParaGuardar, 'user_id'> {
  return {
    category_id: null,
    amount:      montoPorCuota(mov.amount, mov.installments ?? null),
    type:        mov.amount >= 0 ? 'income' : 'expense',
    note:        mov.description.trim(),
    date:        convertirFecha(mov.date),
    source:      'open-banking',
    bank_source: mov.source,
    // "01/01" = pago único — sin valor informativo
    installments: (mov.installments && mov.installments !== '01/01')
      ? mov.installments
      : null,
    balance_after:  mov.balance ?? null,
    card_last_four: cardLastFour,
  };
}

// ─── Parseo de nextBillingDate ────────────────────────────────────────────────
// El scraper devuelve "22 de junio" (texto en español) pese a que el tipo dice dd-mm-yyyy.
// Convertimos a ISO "yyyy-mm-dd" para poder calcular días restantes directamente.
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function parsearNextBillingDate(texto: string): { iso: string; dia: number } | null {
  // Intentar "dd-mm-yyyy" primero (por si el scraper se corrige en el futuro)
  if (/^\d{2}-\d{2}-\d{4}$/.test(texto)) {
    return { iso: convertirFecha(texto), dia: parseInt(texto.split('-')[0], 10) };
  }
  // Formato actual: "22 de junio"
  const m = texto.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóúü]+)/);
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mesIdx = MESES_ES.indexOf(m[2]);
  if (mesIdx === -1 || isNaN(dia) || dia < 1 || dia > 31) return null;

  const hoy = new Date();
  let año = hoy.getFullYear();
  if (new Date(año, mesIdx, dia) < hoy) año++;

  const iso = `${año}-${String(mesIdx + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return { iso, dia };
}

// ─── Cliente Supabase admin ───────────────────────────────────────────────────
// Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local (obtener con: supabase status)
function crearClienteAdmin(): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY en .env.local\n' +
      'Ejecuta `supabase status` para obtener el valor.'
    );
  }
  return createClient(url, key);
}

// ─── Upsert de tarjetas de crédito ───────────────────────────────────────────
// Preserva: name, cycle_close_day, cycle_due_day, active (configurados por el usuario)
// Actualiza: cupos, next_billing_date, billing_period, last_synced_at
async function upsertTarjetas(
  userId: string,
  creditCards: CreditCardBalance[],
  db: SupabaseClient
): Promise<void> {
  for (const card of creditCards) {
    const last_four = extraerLastFour(card.label);
    if (!last_four) continue;

    // nextBillingDate puede venir como "22 de junio" o "dd-mm-yyyy" → normalizar a ISO
    const billingInfo = card.nextBillingDate
      ? parsearNextBillingDate(card.nextBillingDate)
      : null;

    const nextBillingIso  = billingInfo?.iso  ?? null;
    const closeDayNuevo   = billingInfo?.dia  ?? null;

    const campos = {
      used_clp:          card.national?.used      ?? 0,
      available_clp:     card.national?.available ?? 0,
      total_clp:         card.national?.total     ?? 0,
      used_usd:          card.international?.used      ?? null,
      available_usd:     card.international?.available ?? null,
      total_usd:         card.international?.total     ?? null,
      next_billing_date: nextBillingIso,
      billing_period:    card.billingPeriod ?? null,
      last_synced_at:    new Date().toISOString(),
      source:            'open-banking' as const,
    };

    const { data: existente } = await db
      .from('credit_cards')
      .select('id')
      .eq('user_id', userId)
      .eq('last_four', last_four)
      .maybeSingle();

    if (existente) {
      await db
        .from('credit_cards')
        .update({
          ...campos,
          // El banco es la fuente autoritativa del día de cierre
          ...(closeDayNuevo !== null ? { cycle_close_day: closeDayNuevo } : {}),
        })
        .eq('id', existente.id);
    } else {
      const nombreLimpio = card.label.replace(/\s*\*{4}\d{4}.*$/, '').trim();

      await db.from('credit_cards').insert({
        user_id:         userId,
        last_four,
        name:            nombreLimpio,
        cycle_close_day: closeDayNuevo ?? 23,
        cycle_due_day:   6,
        active:          true,
        ...campos,
      });
    }
  }
}

// ─── Snapshot de saldo de cuenta corriente ────────────────────────────────────
async function insertarSnapshot(
  userId: string,
  saldo: number,
  db: SupabaseClient
): Promise<void> {
  await db.from('account_snapshots').insert({
    user_id:   userId,
    balance:   saldo,
    synced_at: new Date().toISOString(),
  });
}

// ─── Detección de errores de autenticación ────────────────────────────────────
function esErrorDeAutenticacion(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return (
    m.includes('credencial') ||
    m.includes('clave') ||
    m.includes('contraseña') ||
    m.includes('rut') ||
    m.includes('login') ||
    m.includes('autenticac')
  );
}

// ─── Función principal ────────────────────────────────────────────────────────
export async function sincronizarBancoChile(
  userId: string,
  onProgreso?: (paso: string) => void
): Promise<ResultadoSync> {
  const rut = process.env.BANCOCHILE_RUT;
  const password = process.env.BANCOCHILE_PASS;

  if (!rut || !password) {
    throw new Error(
      'Faltan credenciales. Agrega BANCOCHILE_RUT y BANCOCHILE_PASS en .env.local'
    );
  }

  let resultado: ScrapeResult;

  try {
    resultado = await bchile.scrape({
      rut,
      password,
      onProgress: onProgreso,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al ejecutar el scraper';
    throw new Error(`Error del scraper: ${mensaje}`);
  }

  if (!resultado.success) {
    const mensajeError = resultado.error ?? 'Error desconocido del scraper';
    if (esErrorDeAutenticacion(mensajeError)) {
      throw new Error('AUTH_ERROR');
    }
    throw new Error(`El scraper no pudo obtener movimientos: ${mensajeError}`);
  }

  // ─── Movimientos de cuenta corriente ────────────────────────────────────────
  const movsCC = (resultado.accounts?.[0]?.movements ?? [])
    .map(mov => convertirMovimiento(mov, null));

  // ─── Movimientos de tarjetas de crédito ─────────────────────────────────────
  // card_last_four se lee de mov.card ("****6074") por movimiento individual —
  // el scraper puede anidar el mismo movimiento billed en varias tarjetas padre,
  // pero mov.card siempre apunta a la tarjeta real. Fallback al label de la
  // tarjeta padre si mov.card no está disponible.
  const movsTC: Omit<TransaccionParaGuardar, 'user_id'>[] = [];
  for (const card of resultado.creditCards ?? []) {
    for (const mov of card.movements ?? []) {
      const last_four = mov.card
        ? mov.card.replace('****', '')
        : extraerLastFour(card.label);
      movsTC.push(convertirMovimiento(mov, last_four));
    }
  }

  const movimientos = [...movsCC, ...movsTC];

  // ─── Persistencia en Supabase ────────────────────────────────────────────────
  const db = crearClienteAdmin();

  if ((resultado.creditCards ?? []).length > 0) {
    await upsertTarjetas(userId, resultado.creditCards!, db);
  }

  const saldo = resultado.accounts?.[0]?.balance;
  if (saldo !== undefined && saldo > 0) {
    await insertarSnapshot(userId, saldo, db);
  }

  return { movimientos };
}
