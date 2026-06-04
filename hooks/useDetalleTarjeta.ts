// hooks/useDetalleTarjeta.ts
// Datos para la pantalla de detalle de una tarjeta de crédito.
// Permite navegar entre ciclos pasados con cicloOffset.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getCycleRange, formatearRangoCiclo, cicloAIso } from '../lib/cycleUtils';
import type { CreditCard } from '../types';

export interface TransaccionDetalle {
  id: string;
  amount: number;
  note: string;
  date: string;
  owner: 'me' | 'split' | 'other' | null;
  split_amount: number | null;
  split_person: string | null;
}

export function useDetalleTarjeta(tarjetaId: string) {
  const [tarjeta, setTarjeta]             = useState<CreditCard | null>(null);
  const [transacciones, setTransacciones] = useState<TransaccionDetalle[]>([]);
  const [cicloOffset, setCicloOffset]     = useState(0);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

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

      const { data, error: err } = await supabase
        .from('transactions')
        .select('id, amount, note, date, owner, split_amount, split_person')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('date', startISO)
        .lte('date', endISO)
        .order('date', { ascending: false });

      if (!activo) return;
      if (err) {
        setError('No se pudieron cargar las transacciones.');
        setLoading(false);
        return;
      }
      setTransacciones((data ?? []) as unknown as TransaccionDetalle[]);
      setLoading(false);
    }

    cargarTransacciones();
    return () => { activo = false; };
  }, [tarjeta, cicloOffset]);

  // Totales derivados en render (sin useEffect extra)
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
    totalNeto,
    totalBruto,
    cicloLabel,
    loading,
    error,
  };
}
