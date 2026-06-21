// lib/balanceClassify.ts
// Clasificación económica de movimientos para el modelo de balance del Home.
//
// Banco de Chile NO etiqueta el "tipo económico" de un movimiento, así que lo
// inferimos por la glosa (note). Sin esto, el balance contaba como ingreso los
// pagos/reversos de tarjeta y los rescates de Fintual, e inflaba los egresos con
// el pago de la tarjeta (que ya está contado como gasto TC) y con los aportes a
// Fintual (que son ahorro, no gasto).
//
// IMPORTANTE: estas listas son específicas de Chile y heurísticas. Si aparece
// una plataforma o glosa nueva, hay que agregarla aquí. Es el único lugar.

// Plataformas de ahorro/inversión:
//   traspaso A estas  → ahorro (no gasto)
//   traspaso DE estas → rescate de ahorro (no ingreso)
const PLATAFORMAS_AHORRO = /\b(fintual|racional|fintoc|betterfly|zest)\b/i;

// Pago de la tarjeta de crédito desde la cuenta: es repago de deuda, no consumo.
// (El consumo ya está contado en los movimientos de la TC.)
const PAGO_TARJETA = /(pago\s+tarjeta|cargo\s+por\s+pago\s+tc|pago\s+tc\b|pago\s+(dolar|pesos)\s+tef)/i;

// Traspaso entre cuentas propias del usuario (no es ingreso ni gasto real).
const TRASPASO_INTERNO = /traspaso\s+(a|de)\s+cuenta\s*:/i;

export interface MovClasificable {
  type: 'income' | 'expense';
  bank_source: string | null;
  note: string;
}

const ES_TC = (bs: string | null) =>
  bs === 'credit_card_unbilled' || bs === 'credit_card_billed';

// ¿Es un abono/pago/reverso de TARJETA registrado como income? No es ingreso real.
export function esAbonoTarjeta(m: MovClasificable): boolean {
  return m.type === 'income' && ES_TC(m.bank_source);
}

export type CategoriaBalance = 'ingreso' | 'ahorro' | 'egreso_tc' | 'egreso_cc' | 'ignorar';

// Categoría económica de un movimiento para el balance.
export function clasificar(m: MovClasificable): CategoriaBalance {
  // 1. Movimientos que NO son ingreso ni gasto real → se ignoran del balance
  if (esAbonoTarjeta(m)) return 'ignorar';                       // pago/reverso de TC visto como income
  if (TRASPASO_INTERNO.test(m.note)) return 'ignorar';          // entre cuentas propias
  if (PLATAFORMAS_AHORRO.test(m.note) && m.type === 'income') return 'ignorar'; // rescate de ahorro

  // 2. Ingresos reales
  if (m.type === 'income') return 'ingreso';

  // 3. Gastos
  if (PLATAFORMAS_AHORRO.test(m.note)) return 'ahorro';         // traspaso A Fintual = ahorro
  if (PAGO_TARJETA.test(m.note)) return 'ignorar';              // repago de deuda, no consumo
  if (ES_TC(m.bank_source)) return 'egreso_tc';
  return 'egreso_cc';
}
