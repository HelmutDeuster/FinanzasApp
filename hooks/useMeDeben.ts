// hooks/useMeDeben.ts
// Consulta todas las transacciones donde alguien le debe dinero al usuario
// (owner = 'split' o 'other'), las agrupa por persona y calcula cuánto
// debe cada una en total.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

// Una transacción individual que genera deuda
export interface TxCobro {
  id: string;
  note: string;
  date: string;
  amount: number;           // monto total de la transacción
  split_amount: number | null;  // tu parte (solo relevante en 'split')
  owner: 'split' | 'other';
  deuda: number;            // cuánto te debe esta persona por esta transacción
}

// Resumen de deuda agrupado por persona
export interface DeudaPorPersona {
  persona: string;
  totalDeuda: number;
  transacciones: TxCobro[];
}

// ─── Fila cruda que devuelve Supabase ─────────────────────────────────────────

interface FilaDB {
  id: string;
  amount: number;
  note: string;
  date: string;
  owner: 'split' | 'other';
  split_amount: number | null;
  split_person: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMeDeben() {
  const [personas, setPersonas]   = useState<DeudaPorPersona[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  // Nombre de la persona cuyo pago está procesándose en este momento
  const [pagandoA, setPagandoA]   = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Trae solo filas donde hay deuda: owner split/other con persona registrada
    const { data, error: err } = await supabase
      .from('transactions')
      .select('id, amount, note, date, owner, split_amount, split_person')
      .eq('user_id', user.id)
      .in('owner', ['split', 'other'])
      .not('split_person', 'is', null)
      .order('date', { ascending: false });

    if (err) {
      setError('No se pudieron cargar los cobros pendientes.');
      setLoading(false);
      return;
    }

    // Agrupa por persona y calcula la deuda de cada transacción
    const mapa: Record<string, DeudaPorPersona> = {};

    for (const fila of (data ?? []) as FilaDB[]) {
      const persona = fila.split_person!;
      const total   = Math.abs(fila.amount);

      // Cuánto debe esta persona:
      //   other → debe el total completo (lo pagó por el usuario)
      //   split → debe (total - mi parte)
      const deuda = fila.owner === 'other'
        ? total
        : total - Math.abs(fila.split_amount ?? 0);

      // Ignora casos donde el cálculo arroje deuda <= 0
      if (deuda <= 0) continue;

      if (!mapa[persona]) {
        mapa[persona] = { persona, totalDeuda: 0, transacciones: [] };
      }

      mapa[persona].totalDeuda += deuda;
      mapa[persona].transacciones.push({
        id:           fila.id,
        note:         fila.note,
        date:         fila.date,
        amount:       total,
        split_amount: fila.split_amount,
        owner:        fila.owner,
        deuda,
      });
    }

    // Ordena personas por deuda descendente (la más grande primero)
    // Las transacciones de cada persona ya vienen ordenadas por fecha (query)
    const lista = Object.values(mapa)
      .filter(p => p.totalDeuda > 0)
      .sort((a, b) => b.totalDeuda - a.totalDeuda);

    setPersonas(lista);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Marca todas las transacciones de una persona como 'me' (pagadas)
  // Esto limpia el split y las saca de esta pantalla.
  async function registrarPago(persona: string) {
    setPagandoA(persona);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPagandoA(null); return; }

    const ids = personas
      .find(p => p.persona === persona)
      ?.transacciones.map(tx => tx.id) ?? [];

    if (ids.length > 0) {
      await supabase
        .from('transactions')
        .update({ owner: 'me', split_amount: null, split_person: null })
        .in('id', ids)
        .eq('user_id', user.id);
      // Si hay error en el update, cargar() lo resolverá igualmente
    }

    setPagandoA(null);
    await cargar();
  }

  // Suma de todas las deudas activas
  const totalPendiente = personas.reduce((sum, p) => sum + p.totalDeuda, 0);

  return {
    personas,
    loading,
    error,
    totalPendiente,
    pagandoA,
    registrarPago,
    recargar: cargar,
  };
}
