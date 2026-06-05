// hooks/useGastoMensualTarjeta.ts
// Gasto mensual histórico TC — alimenta el gráfico de barras en el detalle de tarjeta.
//
// Layout del gráfico: 7 barras centradas en el mes actual.
//   [-3] [-2] [-1] [HOY] [+1] [+2] [+3]
// Los meses futuros (+1 a +3) tienen monto 0 — sirven de contexto visual.
//
// Limitación: card_last_four es NULL en todas las transacciones actuales
// (scraper v2.1.2). El hook acepta el parámetro para cuando la librería lo exponga.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// La firma de índice [key: string]: unknown es requerida por los genéricos de Victory Native
// aunque ya no usamos Victory en este componente. La mantenemos por compatibilidad.
export interface GastoMes {
  [key: string]: unknown;
  idx:           number;   // posición en el array (xKey numérico)
  label:         string;   // "may", "ene '27" (incluye año abreviado cuando cambia)
  monto:         number;
  esCurrent:     boolean;  // true solo para el mes actual
  año:           number;   // año calendario para detectar cambios de año
  esProyectado?: boolean;  // true para barras de proyección futura (cuotas)
}

// Genera 7 entradas centradas en el mes actual: -3 … 0 … +3
function generarMesesCentrados(
  porMes: Map<string, number>
): GastoMes[] {
  const hoy    = new Date();
  const result: GastoMes[] = [];

  for (let delta = -3; delta <= 3; delta++) {
    const d      = new Date(hoy.getFullYear(), hoy.getMonth() + delta, 1);
    const mesStr = String(d.getMonth() + 1).padStart(2, '0');
    const key    = `${d.getFullYear()}-${mesStr}`;
    const idx    = delta + 3; // 0 … 6

    // Etiqueta base
    let label = MESES_CORTOS[d.getMonth()];

    // Añadir año abreviado cuando es la primera barra o cuando cambia de año
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

export function useGastoMensualTarjeta(cardLastFour: string | null) {
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
      .in('bank_source', ['credit_card_unbilled', 'credit_card_billed'])
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
  }, [cardLastFour]);

  useEffect(() => { cargar(); }, [cargar]);

  return { datos, loading };
}
