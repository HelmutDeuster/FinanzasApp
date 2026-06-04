// hooks/useModoTarjeta.ts
// Carga los datos para el Modo Tarjeta del Home.
//
// Composición:
//   - Llama a useCreditCards() para obtener las tarjetas configuradas.
//   - Cuando las tarjetas están listas, hace una sola query de transacciones TC
//     cubriendo el rango más amplio de todos los ciclos activos.
//   - Calcula spend neto (mi parte) y bruto (total) por tarjeta filtrando en memoria.
//
// Ciclo de referencia:
//   La tarjeta con mayor spend neto en su propio ciclo se usa como referencia
//   para el número principal del Home. Esto evita doble conteo cuando los ciclos
//   de distintas tarjetas se solapan.
//
// LIMITACIÓN CONOCIDA:
//   open-banking-chile no etiqueta a qué tarjeta pertenece cada movimiento.
//   El spend por tarjeta = suma neta de TC dentro del rango de *su* ciclo.
//   Si dos ciclos se solapan (ej. Visa 24may–23jun, MC 6may–5jun), una transacción
//   del 24may–5jun puede aparecer en el spend de ambas tarjetas.
//   El número principal (totalNeto) usa solo el ciclo de referencia → sin doble conteo.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getCycleRange } from '../lib/cycleUtils';
import { useCreditCards } from './useCreditCards';
import type { CreditCard } from '../types';
import type { TransaccionConCategoria } from './useTransactions';

// ─── Tipos ────────────────────────────────────────────────────────────────────

// Transacción de tarjeta de crédito con campos de owner/split para el cálculo neto.
export interface TransaccionTC extends TransaccionConCategoria {
  bank_source: 'account' | 'credit_card_unbilled' | 'credit_card_billed' | null;
  owner: 'me' | 'split' | 'other' | null;
  split_amount: number | null;
}

// Spend neto y bruto de una tarjeta en su ciclo propio.
export interface SpendTarjeta {
  cardId: string;
  neto: number;   // mi parte (excluye splits y 100%-de-otro)
  bruto: number;  // monto total sin excluir nada
}

export interface DatosCicloTC {
  totalNeto: number;             // mi parte en el ciclo de referencia
  totalBruto: number;            // bruto en el ciclo de referencia (>= totalNeto)
  spendPorTarjeta: SpendTarjeta[];
  transacciones: TransaccionTC[];  // del ciclo de referencia, para mostrar en lista
  cards: CreditCard[];
  cicloRef: {
    start: Date;
    end: Date;
    closeDay: number;
    cardRef: CreditCard | null;    // primera tarjeta del grupo que cierra más pronto
    tarjetasRef: CreditCard[];     // todas las tarjetas del grupo de referencia
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FUENTES_TC = ['credit_card_unbilled', 'credit_card_billed'] as const;

// Calcula la parte neta que corresponde al usuario de una transacción.
// - 'other'  → el gasto es 100% de otra persona → 0
// - 'split'  → solo la parte acordada (split_amount)
// - 'me'/null → monto completo
function calcularNeto(tx: TransaccionTC): number {
  if (tx.owner === 'other') return 0;
  if (tx.owner === 'split' && tx.split_amount != null) return Number(tx.split_amount);
  return Number(tx.amount);
}

// Convierte un Date a string ISO-date "yyyy-mm-dd" para comparar con campos de BD.
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useModoTarjeta(defaultCloseDay: number = 23) {
  const { cards, loading: loadingCards, refrescar: refrescarCards } = useCreditCards();
  const [datos, setDatos] = useState<DatosCicloTC | null>(null);
  const [loadingTx, setLoadingTx] = useState(true);

  const cargar = useCallback(async () => {
    // Esperar a que las tarjetas terminen de cargar antes de continuar.
    // Cuando loadingCards cambie a false, cargar() se reconstruye y el efecto
    // vuelve a dispararse automáticamente.
    if (loadingCards) return;

    setLoadingTx(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingTx(false); return; }

    // ── 1. Calcular el rango de fechas más amplio que cubra todos los ciclos ──
    // Necesitamos una sola query que incluya todas las transacciones relevantes.
    const ranges = cards.length > 0
      ? cards.map(c => getCycleRange(c.cycle_close_day))
      : [getCycleRange(defaultCloseDay)];

    const inicio = ranges.reduce(
      (min, r) => r.start < min ? r.start : min,
      ranges[0].start
    );
    const fin = ranges.reduce(
      (max, r) => r.end > max ? r.end : max,
      ranges[0].end
    );

    // ── 2. Query de todas las transacciones TC en el rango amplio ────────────
    const { data: txData } = await supabase
      .from('transactions')
      .select('id, amount, type, note, date, bank_source, owner, split_amount, categories(name, color, icon)')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .in('bank_source', FUENTES_TC)
      .gte('date', toISO(inicio))
      .lte('date', toISO(fin))
      .order('date', { ascending: false });

    const todasLasTx = (txData ?? []) as unknown as TransaccionTC[];

    // ── 3. Spend por tarjeta (filtrando en memoria por el ciclo de cada una) ──
    const spendPorTarjeta: SpendTarjeta[] = cards.map(card => {
      const { start, end } = getCycleRange(card.cycle_close_day);
      const s = toISO(start);
      const e = toISO(end);
      const txCard = todasLasTx.filter(tx => tx.date >= s && tx.date <= e);
      const neto = txCard.reduce((sum, tx) => sum + calcularNeto(tx), 0);
      const bruto = txCard.reduce((sum, tx) => sum + Number(tx.amount), 0);
      return { cardId: card.id, neto, bruto };
    });

    // ── 4. Ciclo de referencia: grupo que cierra más próximo a hoy ───────────
    // Se agrupa por cycle_close_day. El grupo con menos días hasta el cierre
    // representa la próxima factura a pagar → es el hero del Home.
    // Cuando ese ciclo venza, getCycleRange avanza automáticamente al siguiente.
    const gruposPorCierre = new Map<number, CreditCard[]>();
    for (const card of cards) {
      const grupo = gruposPorCierre.get(card.cycle_close_day) ?? [];
      grupo.push(card);
      gruposPorCierre.set(card.cycle_close_day, grupo);
    }

    let closeDayRef = defaultCloseDay;
    let minDiasHastaClose = Infinity;

    for (const [closeDay] of gruposPorCierre) {
      const { end } = getCycleRange(closeDay);
      const dias = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (dias < minDiasHastaClose) {
        minDiasHastaClose = dias;
        closeDayRef = closeDay;
      }
    }

    const tarjetasRef = gruposPorCierre.get(closeDayRef) ?? [];
    const cardRef = tarjetasRef[0] ?? null;
    const cicloRefRange = getCycleRange(closeDayRef);

    // ── 5. Totales del ciclo de referencia ───────────────────────────────────
    const refStart = toISO(cicloRefRange.start);
    const refEnd = toISO(cicloRefRange.end);
    const txRef = todasLasTx.filter(tx => tx.date >= refStart && tx.date <= refEnd);
    const totalNeto = txRef.reduce((s, tx) => s + calcularNeto(tx), 0);
    const totalBruto = txRef.reduce((s, tx) => s + Number(tx.amount), 0);

    setDatos({
      totalNeto,
      totalBruto,
      spendPorTarjeta,
      transacciones: txRef,
      cards,
      cicloRef: { ...cicloRefRange, closeDay: closeDayRef, cardRef, tarjetasRef },
    });
    setLoadingTx(false);
  }, [cards, loadingCards, defaultCloseDay]);

  useEffect(() => { cargar(); }, [cargar]);

  // refrescar recarga tarjetas; cuando cardsChange, cargar() se re-ejecuta.
  return { datos, loading: loadingCards || loadingTx, refrescar: refrescarCards };
}
