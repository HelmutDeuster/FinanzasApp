// hooks/useProyeccionCuotas.ts
// Analiza cuotas activas y proyecta pagos futuros.
//
// Banco de Chile registra el PRECIO TOTAL de la compra en cada transacción,
// no el valor de la cuota. Por eso dividimos:
//   montoCuota = amount / cuotaTotal
//
// Ejemplo real: CONSTRU-MART $106.820 cuota 01/03
//   → paga $35.606/mes × 3 meses = $106.820 total
//   → quedan 2 cuotas → comprometido: $71.213

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface CuotaActiva {
  note:            string;
  cuotaActual:     number;   // ej. 1
  cuotaTotal:      number;   // ej. 3
  cuotasRestantes: number;   // ej. 2
  montoCuota:      number;   // amount / cuotaTotal — lo que se paga cada mes
  totalRestante:   number;   // montoCuota × cuotasRestantes
  fechaBase:       string;   // fecha ISO de la última cuota vista
}

export interface MesProyectado {
  label:   string;
  monto:   number;
  detalle: { note: string; monto: number }[];
}

export interface DatosProyeccionCuotas {
  cuotasActivas:     CuotaActiva[];
  totalComprometido: number;
  proyeccion:        MesProyectado[];  // próximos 4 meses
}

function parsearCuota(s: string | null): { actual: number; total: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const actual = parseInt(m[1]);
  const total  = parseInt(m[2]);
  if (actual <= 0 || total <= 0 || actual > total) return null;
  return { actual, total };
}

const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function labelMes(d: Date): string {
  return `${MESES_C[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

export function useProyeccionCuotas() {
  const [datos, setDatos] = useState<DatosProyeccionCuotas | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const hoy   = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 12, 1);

    const { data } = await supabase
      .from('transactions')
      .select('note, amount, installments, date')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .not('installments', 'is', null)
      .gte('date', desde.toISOString().slice(0, 10))
      .order('date', { ascending: false });

    if (!data || data.length === 0) {
      setDatos({ cuotasActivas: [], totalComprometido: 0, proyeccion: [] });
      setLoading(false);
      return;
    }

    // Agrupar por nota → cuota más avanzada por compra
    const porNota = new Map<string, {
      actual:  number;
      total:   number;
      monto:   number;   // precio total de la compra (amount del banco)
      fecha:   string;
    }>();

    for (const tx of data) {
      const parsed = parsearCuota(tx.installments as string | null);
      if (!parsed) continue;

      const key = tx.note.trim();
      const prev = porNota.get(key);

      if (!prev || parsed.actual > prev.actual) {
        porNota.set(key, {
          actual: parsed.actual,
          total:  parsed.total,
          monto:  Number(tx.amount),  // precio total de la compra
          fecha:  tx.date,
        });
      }
    }

    // Calcular cuotas activas con la matemática correcta
    const cuotasActivas: CuotaActiva[] = [];

    for (const [note, info] of porNota) {
      const restantes = info.total - info.actual;
      if (restantes <= 0) continue;

      // El banco registra el precio total. Dividimos para obtener la cuota mensual.
      const montoCuota   = Math.round(info.monto / info.total);
      const totalRestante = montoCuota * restantes;

      cuotasActivas.push({
        note,
        cuotaActual:     info.actual,
        cuotaTotal:      info.total,
        cuotasRestantes: restantes,
        montoCuota,
        totalRestante,
        fechaBase:       info.fecha,
      });
    }

    cuotasActivas.sort((a, b) => b.totalRestante - a.totalRestante);

    const totalComprometido = cuotasActivas.reduce((s, c) => s + c.totalRestante, 0);

    // Proyección mes a mes — próximos 4 meses
    const proyMap = new Map<string, {
      label:   string;
      monto:   number;
      detalle: { note: string; monto: number }[];
    }>();

    for (const cuota of cuotasActivas) {
      const base = new Date(cuota.fechaBase + 'T12:00:00');

      for (let i = 1; i <= cuota.cuotasRestantes; i++) {
        const mesFuturo = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const diff = (mesFuturo.getFullYear() - hoy.getFullYear()) * 12
                   + (mesFuturo.getMonth() - hoy.getMonth());

        // Solo próximos 4 meses (excluyendo el mes actual)
        if (diff <= 0 || diff > 4) continue;

        const key = `${mesFuturo.getFullYear()}-${mesFuturo.getMonth()}`;
        if (!proyMap.has(key)) {
          proyMap.set(key, { label: labelMes(mesFuturo), monto: 0, detalle: [] });
        }
        const e = proyMap.get(key)!;
        e.monto += cuota.montoCuota;
        e.detalle.push({ note: cuota.note, monto: cuota.montoCuota });
      }
    }

    // Array ordenado de los próximos 4 meses (aunque no haya cuotas)
    const proyeccion: MesProyectado[] = [];
    for (let i = 1; i <= 4; i++) {
      const d   = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const e   = proyMap.get(key);
      proyeccion.push({ label: labelMes(d), monto: e?.monto ?? 0, detalle: e?.detalle ?? [] });
    }

    setDatos({ cuotasActivas, totalComprometido, proyeccion });
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return { datos, loading };
}
