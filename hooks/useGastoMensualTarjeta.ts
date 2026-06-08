// hooks/useGastoMensualTarjeta.ts
// Gasto mensual TC — alimenta el gráfico de barras en el detalle de tarjeta.
//
// Layout del gráfico: 7 barras centradas en el mes actual.
//   [-3] [-2] [-1] [HOY] [+1] [+2] [+3]
// Los meses futuros (+1 a +3) tienen monto 0 — se reemplazan con cuotas proyectadas.
//
// Parámetro tarjetaId:
//   null    → total global (suma de todas las TC) — para la pestaña Home
//   UUID    → solo esa tarjeta — misma estrategia dual que useModoTarjeta:
//               EXACTA si hay card_last_four en transactions,
//               PROPORCIONAL (por used_clp) si no.
//
// Retorna también factorPeso para que el caller pueda escalar las barras
// futuras (cuotas proyectadas) con el mismo factor proporcional.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// La firma de índice [key: string]: unknown es requerida por los genéricos de Victory Native
// aunque ya no usamos Victory en este componente. La mantenemos por compatibilidad.
export interface GastoMes {
  [key: string]: unknown;
  idx:           number;
  label:         string;
  monto:         number;
  esCurrent:     boolean;
  año:           number;
  esProyectado?: boolean;
}

function generarMesesCentrados(porMes: Map<string, number>): GastoMes[] {
  const hoy    = new Date();
  const result: GastoMes[] = [];

  for (let delta = -3; delta <= 3; delta++) {
    const d      = new Date(hoy.getFullYear(), hoy.getMonth() + delta, 1);
    const mesStr = String(d.getMonth() + 1).padStart(2, '0');
    const key    = `${d.getFullYear()}-${mesStr}`;
    const idx    = delta + 3;

    let label = MESES_CORTOS[d.getMonth()];
    const añoAnterior = idx > 0
      ? new Date(hoy.getFullYear(), hoy.getMonth() + delta - 1, 1).getFullYear()
      : null;
    if (añoAnterior === null || d.getFullYear() !== añoAnterior) {
      label = `${label} '${String(d.getFullYear()).slice(2)}`;
    }

    result.push({
      idx,
      label,
      monto:     Math.round(porMes.get(key) ?? 0),
      esCurrent: delta === 0,
      año:       d.getFullYear(),
    });
  }

  return result;
}

export function useGastoMensualTarjeta(tarjetaId: string | null) {
  const [datos, setDatos] = useState<GastoMes[]>([]);
  const [factorPeso, setFactorPeso] = useState(1);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const hoy    = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);
    const inicioISO = inicio.toISOString().slice(0, 10);
    const hoyISO    = hoy.toISOString().slice(0, 10);

    if (tarjetaId === null) {
      // Modo global: suma de todas las TC (para pestaña Tarjetas del Home)
      const { data } = await supabase
        .from('transactions')
        .select('amount, date')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .in('bank_source', ['credit_card_unbilled', 'credit_card_billed'])
        .gte('date', inicioISO)
        .lte('date', hoyISO);

      const porMes = new Map<string, number>();
      for (const tx of data ?? []) {
        const [añoStr, mesStr] = tx.date.split('-');
        porMes.set(`${añoStr}-${mesStr}`, (porMes.get(`${añoStr}-${mesStr}`) ?? 0) + Number(tx.amount));
      }
      setDatos(generarMesesCentrados(porMes));
      setFactorPeso(1);
    } else {
      // Modo tarjeta específica: estrategia exacta o proporcional
      const [txResult, cardsResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount, date, card_last_four')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .in('bank_source', ['credit_card_unbilled', 'credit_card_billed'])
          .gte('date', inicioISO)
          .lte('date', hoyISO),
        supabase
          .from('credit_cards')
          .select('id, used_clp, last_four')
          .eq('user_id', user.id)
          .eq('active', true),
      ]);

      const rawTx    = (txResult.data ?? []) as { amount: string; date: string; card_last_four: string | null }[];
      const allCards = (cardsResult.data ?? []) as { id: string; used_clp: number | null; last_four: string | null }[];
      const thisCard = allCards.find(c => c.id === tarjetaId);

      const hayCardLastFour = rawTx.some(tx => tx.card_last_four != null);
      const porMes = new Map<string, number>();
      let factor = 1;

      if (hayCardLastFour) {
        // Filtrado exacto por card_last_four
        for (const tx of rawTx.filter(tx => tx.card_last_four === thisCard?.last_four)) {
          const [añoStr, mesStr] = tx.date.split('-');
          const key = `${añoStr}-${mesStr}`;
          porMes.set(key, (porMes.get(key) ?? 0) + Number(tx.amount));
        }
      } else {
        // Distribución proporcional por used_clp
        const pesoTotal = allCards.reduce((s, c) => s + (c.used_clp ?? 0), 0);
        factor = allCards.length > 1
          ? (pesoTotal > 0 ? (thisCard?.used_clp ?? 0) / pesoTotal : 1 / allCards.length)
          : 1;

        for (const tx of rawTx) {
          const [añoStr, mesStr] = tx.date.split('-');
          const key = `${añoStr}-${mesStr}`;
          porMes.set(key, (porMes.get(key) ?? 0) + Number(tx.amount) * factor);
        }
      }

      setDatos(generarMesesCentrados(porMes));
      setFactorPeso(factor);
    }

    setLoading(false);
  }, [tarjetaId]);

  useEffect(() => { cargar(); }, [cargar]);

  return { datos, loading, factorPeso };
}
