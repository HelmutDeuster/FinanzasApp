// hooks/useModoTarjeta.ts
// Datos para la pestaña Tarjetas del Home.
//
// Spend por tarjeta — dos estrategias según datos disponibles:
//
//   EXACTA (futura): cuando card_last_four esté disponible en transactions,
//     filtramos por tarjeta específica dentro de su propio ciclo.
//
//   PROPORCIONAL (actual): card_last_four es NULL en todas las transacciones
//     porque el scraper v2.1.2 no etiqueta a qué tarjeta pertenece cada
//     movimiento. Distribuimos el total TC del período entre las tarjetas
//     ponderando por used_clp — el banco nos dice cuánto usó cada tarjeta.
//     Cuando el scraper exponga card_last_four, el if/else cambia de rama
//     automáticamente sin tocar la UI.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getCycleRange } from '../lib/cycleUtils';
import { useCreditCards } from './useCreditCards';
import type { CreditCard } from '../types';
import type { TransaccionConCategoria } from './useTransactions';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TransaccionTC extends TransaccionConCategoria {
  bank_source:    'account' | 'credit_card_unbilled' | 'credit_card_billed' | null;
  owner:          'me' | 'split' | 'other' | null;
  split_amount:   number | null;
  card_last_four: string | null;   // NULL hoy — estrategia proporcional activa
}

export interface SpendTarjeta {
  cardId: string;
  neto:   number;  // mi parte (excluye splits y 100%-de-otro)
  bruto:  number;  // monto total sin excluir nada
}

export interface DatosCicloTC {
  totalNeto:        number;
  totalBruto:       number;
  spendPorTarjeta:  SpendTarjeta[];
  transacciones:    TransaccionTC[];   // del ciclo de referencia
  cards:            CreditCard[];
  cicloRef: {
    start:       Date;
    end:         Date;
    closeDay:    number;
    cardRef:     CreditCard | null;
    tarjetasRef: CreditCard[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FUENTES_TC = ['credit_card_unbilled', 'credit_card_billed'] as const;

function calcularNeto(tx: TransaccionTC): number {
  if (tx.owner === 'other') return 0;
  if (tx.owner === 'split' && tx.split_amount != null) return Number(tx.split_amount);
  return Number(tx.amount);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useModoTarjeta(defaultCloseDay: number = 23) {
  const { cards, loading: loadingCards, refrescar: refrescarCards } = useCreditCards();
  const [datos, setDatos] = useState<DatosCicloTC | null>(null);
  const [loadingTx, setLoadingTx] = useState(true);

  const cargar = useCallback(async () => {
    if (loadingCards) return;
    setLoadingTx(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingTx(false); return; }

    // ── 1. Rango de fechas más amplio para cubrir todos los ciclos ───────────
    const ranges = cards.length > 0
      ? cards.map(c => getCycleRange(c.cycle_close_day))
      : [getCycleRange(defaultCloseDay)];

    const inicio = ranges.reduce((min, r) => r.start < min ? r.start : min, ranges[0].start);
    const fin    = ranges.reduce((max, r) => r.end   > max ? r.end   : max, ranges[0].end);

    // ── 2. Query TC — incluye card_last_four para habilitar filtrado exacto
    //       cuando el scraper lo exponga ──────────────────────────────────────
    const { data: txData } = await supabase
      .from('transactions')
      .select('id, amount, type, note, date, bank_source, owner, split_amount, card_last_four, categories(name, color, icon)')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .in('bank_source', FUENTES_TC)
      .gte('date', toISO(inicio))
      .lte('date', toISO(fin))
      .order('date', { ascending: false });

    const todasLasTx = (txData ?? []) as unknown as TransaccionTC[];

    // ── 3. Ciclo de referencia: el grupo de tarjetas que cierra más pronto ───
    const gruposPorCierre = new Map<number, CreditCard[]>();
    for (const card of cards) {
      const grupo = gruposPorCierre.get(card.cycle_close_day) ?? [];
      grupo.push(card);
      gruposPorCierre.set(card.cycle_close_day, grupo);
    }

    let closeDayRef = defaultCloseDay;
    let minDias = Infinity;
    for (const [closeDay] of gruposPorCierre) {
      const { end } = getCycleRange(closeDay);
      const dias = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (dias < minDias) { minDias = dias; closeDayRef = closeDay; }
    }

    const tarjetasRef   = gruposPorCierre.get(closeDayRef) ?? [];
    const cardRef       = tarjetasRef[0] ?? null;
    const cicloRefRange = getCycleRange(closeDayRef);
    const refStart      = toISO(cicloRefRange.start);
    const refEnd        = toISO(cicloRefRange.end);
    const txRef         = todasLasTx.filter(tx => tx.date >= refStart && tx.date <= refEnd);

    const totalNeto  = txRef.reduce((s, tx) => s + calcularNeto(tx), 0);
    const totalBruto = txRef.reduce((s, tx) => s + Number(tx.amount), 0);

    // ── 4. Spend por tarjeta ─────────────────────────────────────────────────
    // Rama EXACTA: cuando el scraper provea card_last_four en transactions.
    // Rama PROPORCIONAL (activa hoy): usamos used_clp del banco como proxy
    // del peso de gasto de cada tarjeta — es el saldo usado según el banco,
    // que refleja el historial real mejor que repartir en partes iguales.
    const hayCardLastFour = todasLasTx.some(tx => tx.card_last_four != null);

    let spendPorTarjeta: SpendTarjeta[];

    if (hayCardLastFour) {
      // Filtrado exacto: solo las transacciones etiquetadas con esta tarjeta
      spendPorTarjeta = cards.map(card => {
        const { start, end } = getCycleRange(card.cycle_close_day);
        const txCard = todasLasTx.filter(tx =>
          tx.date >= toISO(start) &&
          tx.date <= toISO(end) &&
          tx.card_last_four === card.last_four
        );
        return {
          cardId: card.id,
          neto:   txCard.reduce((s, tx) => s + calcularNeto(tx), 0),
          bruto:  txCard.reduce((s, tx) => s + Number(tx.amount), 0),
        };
      });
    } else {
      // Distribución proporcional por used_clp.
      // Si una tarjeta no tiene used_clp (sync no ejecutado aún), se reparte igual.
      const pesoTotal = cards.reduce((s, c) => s + (c.used_clp ?? 0), 0);

      spendPorTarjeta = cards.map(card => {
        const peso = pesoTotal > 0
          ? (card.used_clp ?? 0) / pesoTotal
          : 1 / cards.length;
        return {
          cardId: card.id,
          neto:   Math.round(totalNeto  * peso),
          bruto:  Math.round(totalBruto * peso),
        };
      });
    }

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

  return { datos, loading: loadingCards || loadingTx, refrescar: refrescarCards };
}
