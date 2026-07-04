// hooks/useDetalleTarjeta.ts
// Datos para la pantalla de detalle de una tarjeta de crédito.
// Permite navegar entre ciclos pasados con cicloOffset.
//
// Estrategia de filtrado (misma lógica que useModoTarjeta):
//   EXACTA: cuando card_last_four está disponible → filtramos por tarjeta.
//   PROPORCIONAL (activa hoy): card_last_four es NULL en todos los registros.
//     Mostramos todas las transacciones TC del ciclo pero ajustamos los
//     totales proporcionalmente usando used_clp como peso por tarjeta.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCycleRange, formatearRangoCiclo, cicloAIso } from '../lib/cycleUtils';
import type { CreditCard, BankSource } from '../types';

export interface TransaccionDetalle {
  id: string;
  amount: number;
  note: string;
  date: string;
  owner: 'me' | 'split' | 'other' | null;
  split_amount: number | null;
  split_person: string | null;
  installments: string | null;   // "02/06" — para mostrar en el detalle
  bank_source: BankSource;       // 'credit_card_billed' | 'credit_card_unbilled' — para filtro/cuadre
}

interface TransaccionDetalleRaw extends TransaccionDetalle {
  card_last_four: string | null;
}

export function useDetalleTarjeta(tarjetaId: string) {
  const [tarjeta, setTarjeta]             = useState<CreditCard | null>(null);
  const [transacciones, setTransacciones] = useState<TransaccionDetalle[]>([]);
  const [cicloOffset, setCicloOffset]     = useState(0);
  const [refreshKey, setRefreshKey]       = useState(0);
  const [factorPeso, setFactorPeso]       = useState(1);
  const [esProporcional, setEsProporcional] = useState(false);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  // Pide al efecto de carga que se ejecute de nuevo sin cambiar el ciclo
  function recargar() { setRefreshKey(k => k + 1); }

  // Efecto 1: carga la tarjeta una sola vez al montar
  useEffect(() => {
    let activo = true;

    async function cargarTarjeta() {
      const { data, error: err } = await supabase
        .from('credit_cards')
        .select('*')
        .eq('id', tarjetaId)
        .single();

      if (!activo) return;
      if (err || !data) {
        setError('No se pudo cargar la tarjeta.');
        setLoading(false);
        return;
      }
      setTarjeta(data as CreditCard);
    }

    cargarTarjeta();
    return () => { activo = false; };
  }, [tarjetaId]);

  // Efecto 2: carga transacciones cuando cambia la tarjeta o el offset
  useEffect(() => {
    if (!tarjeta) return;
    let activo = true;

    async function cargarTransacciones() {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!activo) return;
      if (!user) { setLoading(false); return; }

      const { start, end } = getCycleRange(tarjeta!.cycle_close_day, cicloOffset);
      const { startISO, endISO } = cicloAIso(start, end);

      // Cargamos transacciones TC y todas las tarjetas activas en paralelo.
      // Las tarjetas se necesitan para calcular el peso proporcional cuando
      // card_last_four es NULL (situación actual con el scraper v2.1.2).
      const [txResult, cardsResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, amount, note, date, owner, split_amount, split_person, installments, card_last_four, bank_source')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .in('bank_source', ['credit_card_unbilled', 'credit_card_billed'])
          .gte('date', startISO)
          .lte('date', endISO)
          .order('date', { ascending: false }),
        supabase
          .from('credit_cards')
          .select('id, used_clp, last_four')
          .eq('user_id', user.id)
          .eq('active', true),
      ]);

      if (!activo) return;
      if (txResult.error) {
        setError('No se pudieron cargar las transacciones.');
        setLoading(false);
        return;
      }

      const rawTx = (txResult.data ?? []) as unknown as TransaccionDetalleRaw[];
      const todasLasTarjetas = (cardsResult.data ?? []) as {
        id: string; used_clp: number | null; last_four: string | null;
      }[];

      // Estrategia EXACTA: si alguna transacción tiene card_last_four, filtrar por tarjeta.
      // Estrategia PROPORCIONAL: si card_last_four es NULL y hay más de 1 tarjeta, ajustar totales.
      const hayCardLastFour = rawTx.length > 0 && rawTx.every(tx => tx.card_last_four != null);
      let txFiltradas: TransaccionDetalle[];
      let factor = 1;
      let esProp = false;

      if (hayCardLastFour) {
        txFiltradas = rawTx.filter(tx => tx.card_last_four === tarjeta!.last_four);
      } else if (todasLasTarjetas.length > 1) {
        const pesoTotal = todasLasTarjetas.reduce((s, c) => s + (c.used_clp ?? 0), 0);
        const estaCard  = todasLasTarjetas.find(c => c.id === tarjetaId);
        factor = pesoTotal > 0
          ? (estaCard?.used_clp ?? 0) / pesoTotal
          : 1 / todasLasTarjetas.length;
        esProp = true;
        txFiltradas = rawTx;
      } else {
        txFiltradas = rawTx;
      }

      setTransacciones(txFiltradas);
      setFactorPeso(factor);
      setEsProporcional(esProp);
      setLoading(false);
    }

    cargarTransacciones();
    return () => { activo = false; };
  }, [tarjeta, cicloOffset, refreshKey]);

  // Totales derivados en render (sin useEffect extra).
  // Se aplica factorPeso para la distribución proporcional.
  const { totalNeto, totalBruto } = transacciones.reduce(
    (acc, tx) => {
      const bruto = Number(tx.amount);
      let neto: number;
      if (tx.owner === 'other') {
        neto = 0;
      } else if (tx.owner === 'split' && tx.split_amount != null) {
        neto = Number(tx.split_amount);
      } else {
        neto = bruto;
      }
      return { totalNeto: acc.totalNeto + neto, totalBruto: acc.totalBruto + bruto };
    },
    { totalNeto: 0, totalBruto: 0 }
  );

  const cicloLabel = (() => {
    if (!tarjeta) return '';
    const { start, end } = getCycleRange(tarjeta.cycle_close_day, cicloOffset);
    return formatearRangoCiclo(start, end);
  })();

  const puedeAvanzar = cicloOffset < 0;

  return {
    tarjeta,
    transacciones,
    cicloOffset,
    setCicloOffset,
    puedeAvanzar,
    totalNeto:  Math.round(totalNeto  * factorPeso),
    totalBruto: Math.round(totalBruto * factorPeso),
    factorPeso, // expuesto para escalar subtotales por categoría (reconciliación)
    esProporcional,
    cicloLabel,
    loading,
    error,
    recargar,
  };
}
