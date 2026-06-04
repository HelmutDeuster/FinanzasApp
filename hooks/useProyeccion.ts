// hooks/useProyeccion.ts
// Datos para la pantalla Proyección.
//
// Calcula tres valores principales:
//   paraAhorrar = sueldoEstimado − tcCiclo − fijosTotal
//   alcanzaSueldo = paraAhorrar >= 0
//   puedeGastar = max(0, paraAhorrar)
//
// tcCiclo: gastos TC en el ciclo actual según default_close_day
// fijosTotal: suma de gastos recurrentes detectados e incluidos por el usuario
//
// Detección de fijos:
//   Analiza transacciones NO-TC de los 3 ciclos anteriores.
//   Una nota es "fija" si aparece en >= 2 de 3 ciclos con variación de monto <= 10%.
//   El monto proyectado es el promedio de los ciclos donde apareció.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getCycleRange, diasRestantes } from '../lib/cycleUtils';
import { useCreditCards } from './useCreditCards';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface GastoFijo {
  id: string;
  note: string;
  montoPromedio: number;
  ciclosDetectados: number; // 2 o 3
  incluido: boolean;
  montoEditado: number;
}

export interface DatosProyeccion {
  sueldoEstimado: number;
  tcCiclo: number;
  fijos: GastoFijo[];
  fijosTotal: number;
  paraAhorrar: number;
  alcanzaSueldo: boolean;
  puedeGastar: number;
  diasRestantesCiclo: number;
}

// ─── Tipos internos de rows de Supabase ──────────────────────────────────────

interface TxTC {
  amount: number;
  owner: string | null;
  split_amount: number | null;
}

interface TxHistorica {
  amount: number;
  note: string;
  date: string;
  bank_source: string | null;
  owner: string | null;
  split_amount: number | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TC_SOURCES = ['credit_card_unbilled', 'credit_card_billed'] as const;

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Calcula la parte neta que corresponde al usuario de una transacción
function montoNeto(amount: number, owner: string | null, splitAmount: number | null): number {
  if (owner === 'other') return 0;
  if (owner === 'split' && splitAmount != null) return Number(splitAmount);
  return Number(amount);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProyeccion() {
  const { cards, loading: loadingCards } = useCreditCards();

  const [sueldoEstimado, setSueldoEstimado] = useState(0);
  const [tcCiclo, setTcCiclo] = useState(0);
  const [fijos, setFijos] = useState<GastoFijo[]>([]);
  const [diasCiclo, setDiasCiclo] = useState(0);
  const [loading, setLoading] = useState(true);

  // Derivados — se recalculan en cada render sin efecto extra
  const fijosTotal = fijos
    .filter(f => f.incluido)
    .reduce((s, f) => s + f.montoEditado, 0);
  const paraAhorrar = sueldoEstimado - tcCiclo - fijosTotal;

  const cargar = useCallback(async () => {
    if (loadingCards) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // ── 1. Configuración del usuario ─────────────────────────────────────────
    const { data: cfg } = await supabase
      .from('user_settings')
      .select('estimated_salary, default_close_day')
      .eq('user_id', user.id)
      .maybeSingle();

    const sueldo = cfg?.estimated_salary ?? 0;
    const closeDay: number = cfg?.default_close_day ?? 23;
    setSueldoEstimado(sueldo);

    // ── 2. TC del ciclo actual ────────────────────────────────────────────────
    const cicloActual = getCycleRange(closeDay);
    const startActual = toISO(cicloActual.start);
    const endActual = toISO(cicloActual.end);

    const { data: tcData } = await supabase
      .from('transactions')
      .select('amount, owner, split_amount')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .in('bank_source', [...TC_SOURCES])
      .gte('date', startActual)
      .lte('date', endActual);

    let tc = 0;
    for (const tx of (tcData ?? []) as TxTC[]) {
      tc += montoNeto(tx.amount, tx.owner, tx.split_amount);
    }
    setTcCiclo(tc);

    // ── 3. Días restantes en el ciclo ─────────────────────────────────────────
    setDiasCiclo(diasRestantes(cicloActual.end));

    // ── 4. Fijos: los últimos 3 ciclos históricos (solo transacciones NO-TC) ──
    // Ciclos previos: offset -1, -2, -3
    const ciclosPasados = [-1, -2, -3].map(o => getCycleRange(closeDay, o));
    const startHist = toISO(ciclosPasados[2].start);
    const endHist = toISO(ciclosPasados[0].end);

    // Traemos todas las expenses del período y filtramos en memoria para incluir
    // bank_source = null (importados desde TXT) sin problemas de NOT IN con NULLs en SQL
    const { data: histData } = await supabase
      .from('transactions')
      .select('amount, note, date, bank_source, owner, split_amount')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('date', startHist)
      .lte('date', endHist);

    // nota → cicloIdx → monto acumulado en ese ciclo
    const porNota = new Map<string, Map<number, number>>();

    for (const tx of (histData ?? []) as TxHistorica[]) {
      // Excluir TC del análisis de fijos (ya están en tcCiclo)
      if (tx.bank_source && TC_SOURCES.includes(tx.bank_source as typeof TC_SOURCES[number])) {
        continue;
      }

      const nota = tx.note.trim();
      if (!nota) continue;

      const monto = montoNeto(tx.amount, tx.owner, tx.split_amount);
      if (monto === 0) continue;

      // ¿En qué ciclo histórico cae esta transacción?
      const cicloIdx = ciclosPasados.findIndex(({ start, end }) =>
        tx.date >= toISO(start) && tx.date <= toISO(end)
      );
      if (cicloIdx === -1) continue;

      if (!porNota.has(nota)) porNota.set(nota, new Map());
      const cicloMap = porNota.get(nota)!;
      cicloMap.set(cicloIdx, (cicloMap.get(cicloIdx) ?? 0) + monto);
    }

    // Filtrar: >= 2 ciclos y variación de monto <= 10%
    const fijosDetectados: GastoFijo[] = [];

    for (const [nota, cicloMap] of porNota) {
      const montos = [...cicloMap.values()];
      if (montos.length < 2) continue;

      const promedio = montos.reduce((s, m) => s + m, 0) / montos.length;
      if (promedio === 0) continue;

      const maxDesviacion = Math.max(...montos.map(m => Math.abs(m - promedio) / promedio));
      if (maxDesviacion > 0.10) continue;

      const id = `fijo_${nota.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40)}`;

      fijosDetectados.push({
        id,
        note: nota,
        montoPromedio: Math.round(promedio),
        ciclosDetectados: montos.length,
        incluido: true,
        montoEditado: Math.round(promedio),
      });
    }

    // Ordenar por monto descendente para mostrar primero los más grandes
    fijosDetectados.sort((a, b) => b.montoPromedio - a.montoPromedio);
    setFijos(fijosDetectados);

    setLoading(false);
  }, [cards, loadingCards]);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Mutaciones de fijos (actualizan estado local sin re-fetch) ───────────

  function toggleFijo(id: string, incluido: boolean) {
    setFijos(prev => prev.map(f => f.id === id ? { ...f, incluido } : f));
  }

  function editarMonto(id: string, monto: number) {
    setFijos(prev => prev.map(f => f.id === id ? { ...f, montoEditado: monto } : f));
  }

  const datos: DatosProyeccion = {
    sueldoEstimado,
    tcCiclo,
    fijos,
    fijosTotal,
    paraAhorrar,
    alcanzaSueldo: paraAhorrar >= 0,
    puedeGastar: Math.max(0, paraAhorrar),
    diasRestantesCiclo: diasCiclo,
  };

  return { datos, loading, toggleFijo, editarMonto, refrescar: cargar };
}
