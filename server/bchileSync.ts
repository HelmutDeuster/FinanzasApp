// server/bchileSync.ts
// Adaptador entre open-banking-chile y el formato de FinanzasApp.
// Toda la lógica de conversión de datos del banco vive aquí.

import { bchile } from 'open-banking-chile';
import type { BankMovement, CreditCardBalance, ScrapeResult } from 'open-banking-chile';
import type { TransaccionParaGuardar, CreditCardSyncData } from '../types';

// ─── Tipo de retorno ──────────────────────────────────────────────────────────

export interface ResultadoSync {
  movimientos: Omit<TransaccionParaGuardar, 'user_id'>[];
  tarjetas: CreditCardSyncData[];
  saldo: number;              // saldo actual de la cuenta corriente
}

// ─── Conversión de fecha ──────────────────────────────────────────────────────
// open-banking-chile devuelve "dd-mm-yyyy"; Supabase necesita "yyyy-mm-dd"
function convertirFecha(fechaBanco: string): string {
  const [dia, mes, anio] = fechaBanco.split('-');
  return `${anio}-${mes}-${dia}`;
}

// ─── Conversión de movimientos ────────────────────────────────────────────────
// La nota queda limpia (sin cuotas embebidas).
// Las cuotas van a su propia columna `installments`.
// `card_last_four` queda NULL: open-banking-chile v2.1.2 no expone a qué tarjeta
// pertenece cada movimiento individual; la columna existe para versiones futuras.
function convertirMovimiento(
  mov: BankMovement
): Omit<TransaccionParaGuardar, 'user_id'> {
  return {
    category_id: null,
    amount: Math.abs(mov.amount),
    type: mov.amount >= 0 ? 'income' : 'expense',
    note: mov.description.trim(),
    date: convertirFecha(mov.date),
    source: 'open-banking',
    bank_source: mov.source,
    // "01/01" = pago único — no tiene valor informativo, lo descartamos
    installments: (mov.installments && mov.installments !== '01/01')
      ? mov.installments
      : null,
    balance_after: mov.balance ?? null,
    card_last_four: null,
  };
}

// ─── Conversión de tarjetas de crédito ───────────────────────────────────────
// Extrae los últimos 4 dígitos del label: "Visa Infinite ****5786" → "5786"
function extraerLastFour(label: string): string | null {
  const match = label.match(/\*{4}(\d{4})/);
  return match ? match[1] : null;
}

// Devuelve null si no puede extraer el last_four (seguridad: no guardar tarjeta inidentificable)
function convertirTarjeta(cb: CreditCardBalance): CreditCardSyncData | null {
  const last_four = extraerLastFour(cb.label);
  if (!last_four) return null;

  return {
    label: cb.label,
    last_four,
    used_clp:      cb.national?.used      ?? 0,
    available_clp: cb.national?.available ?? 0,
    total_clp:     cb.national?.total     ?? 0,
    used_usd:      cb.international?.used      ?? null,
    available_usd: cb.international?.available ?? null,
    total_usd:     cb.international?.total     ?? null,
    next_billing_date: cb.nextBillingDate ?? null,
    billing_period:    cb.billingPeriod   ?? null,
  };
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

  const movimientos = resultado.movements.map(convertirMovimiento);

  const tarjetas = (resultado.creditCards ?? [])
    .map(convertirTarjeta)
    .filter((t): t is CreditCardSyncData => t !== null);

  const saldo = resultado.balance ?? 0;

  return { movimientos, tarjetas, saldo };
}
