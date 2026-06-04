// hooks/useSplit.ts
// Lógica para el modal de split de gastos.
// Se encarga de los cálculos en tiempo real y de persistir en Supabase.

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { SplitOwner, SplitModo } from '../types';
import type { TransaccionDetalle } from './useDetalleTarjeta';

interface UseSplitParams {
  transaccion: TransaccionDetalle | null;
  onGuardado: () => void;
}

interface UseSplitReturn {
  owner: SplitOwner;
  setOwner: (o: SplitOwner) => void;
  nombre: string;
  setNombre: (n: string) => void;
  modo: SplitModo;
  setModo: (m: SplitModo) => void;
  porcentaje: number;
  setPorcentaje: (p: number) => void;
  montoFijo: string;
  setMontoFijo: (m: string) => void;
  tuParte: number;
  teDebeMonto: number;
  guardando: boolean;
  error: string | null;
  guardar: () => Promise<void>;
  puedeGuardar: boolean;
}

export function useSplit({ transaccion, onGuardado }: UseSplitParams): UseSplitReturn {
  const [owner, setOwner]       = useState<SplitOwner>('me');
  const [nombre, setNombre]     = useState('');
  const [modo, setModo]         = useState<SplitModo>('porcentaje');
  const [porcentaje, setPorcentaje] = useState(50);
  const [montoFijo, setMontoFijo]   = useState('');
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Reinicia el formulario cada vez que el usuario toca una transacción distinta.
  // Si la transacción ya tiene split guardado, lo pre-carga para editarlo.
  useEffect(() => {
    if (!transaccion) return;

    const ownerGuardado = (transaccion.owner as SplitOwner | null) ?? 'me';
    setOwner(ownerGuardado);
    setNombre(transaccion.split_person ?? '');
    setError(null);

    if (ownerGuardado === 'split' && transaccion.split_amount != null) {
      // Reconstruye el porcentaje desde el monto guardado para que los botones
      // rápidos reflejen la selección anterior.
      const total = Math.abs(transaccion.amount);
      const pctCalculado = total > 0
        ? Math.round((transaccion.split_amount / total) * 100)
        : 50;
      setModo('porcentaje');
      setPorcentaje(pctCalculado);
      setMontoFijo('');
    } else {
      setModo('porcentaje');
      setPorcentaje(50);
      setMontoFijo('');
    }
  }, [transaccion?.id]); // solo cuando cambia la transacción seleccionada

  const montoTotal = transaccion ? Math.abs(transaccion.amount) : 0;

  // Cálculos derivados — se recalculan en tiempo real sin estado extra
  const { tuParte, teDebeMonto } = useMemo(() => {
    if (owner !== 'split') return { tuParte: montoTotal, teDebeMonto: 0 };

    let miParte: number;
    if (modo === 'porcentaje') {
      miParte = Math.round(montoTotal * porcentaje / 100);
    } else {
      const mf = parseFloat(montoFijo);
      // Clampea para que "tu parte" nunca supere el total
      miParte = isNaN(mf) ? 0 : Math.min(mf, montoTotal);
    }
    return { tuParte: miParte, teDebeMonto: montoTotal - miParte };
  }, [owner, montoTotal, modo, porcentaje, montoFijo]);

  const puedeGuardar = (() => {
    if (owner === 'me') return true;
    if (nombre.trim().length === 0) return false;
    if (owner === 'other') return true;
    // owner === 'split'
    if (modo === 'monto') {
      const mf = parseFloat(montoFijo);
      return !isNaN(mf) && mf > 0 && mf < montoTotal;
    }
    return porcentaje > 0 && porcentaje < 100;
  })();

  async function guardar() {
    if (!transaccion || !puedeGuardar) return;
    setGuardando(true);
    setError(null);

    type UpdatePayload = {
      owner: SplitOwner;
      split_amount: number | null;
      split_person: string | null;
    };

    let payload: UpdatePayload;

    if (owner === 'me') {
      // Borra cualquier split previo
      payload = { owner: 'me', split_amount: null, split_person: null };
    } else if (owner === 'split') {
      payload = { owner: 'split', split_amount: tuParte, split_person: nombre.trim() };
    } else {
      // 100% de otro — tu neto queda en 0, no hace falta guardar split_amount
      payload = { owner: 'other', split_amount: null, split_person: nombre.trim() };
    }

    const { error: err } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', transaccion.id);

    if (err) {
      setError('No se pudo guardar. Intenta de nuevo.');
      setGuardando(false);
      return;
    }

    setGuardando(false);
    onGuardado();
  }

  return {
    owner, setOwner,
    nombre, setNombre,
    modo, setModo,
    porcentaje, setPorcentaje,
    montoFijo, setMontoFijo,
    tuParte,
    teDebeMonto,
    guardando,
    error,
    guardar,
    puedeGuardar,
  };
}
