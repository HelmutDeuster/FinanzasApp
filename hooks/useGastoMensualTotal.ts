// hooks/useGastoMensualTotal.ts
// Gasto mensual consolidado (todos los tipos) — para el gráfico de la pantalla Proyección.
// 7 barras centradas en el mes actual: [-3 … 0 … +3]

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { GastoMes } from './useGastoMensualTarjeta';

export type { GastoMes };

const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function generarMesesCentrados(porMes: Map<string, number>): GastoMes[] {
  const hoy = new Date();
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

export function useGastoMensualTotal() {
  const [datos, setDatos] = useState<GastoMes[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const hoy    = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);

    const { data } = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('date', inicio.toISOString().slice(0, 10))
      .lte('date', hoy.toISOString().slice(0, 10));

    const porMes = new Map<string, number>();
    for (const tx of data ?? []) {
      const [añoStr, mesStr] = tx.date.split('-');
      const key = `${añoStr}-${mesStr}`;
      porMes.set(key, (porMes.get(key) ?? 0) + Number(tx.amount));
    }

    setDatos(generarMesesCentrados(porMes));
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return { datos, loading };
}
