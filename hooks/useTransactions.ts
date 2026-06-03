// hooks/useTransactions.ts
// Carga y procesa las transacciones del mes/año dado desde Supabase.
// Devuelve totales, las últimas 10 transacciones y gastos agrupados por categoría.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CategoriaJoin {
  name: string;
  color: string;
  icon: string;
}

// Transacción con la categoría resuelta por el join
export interface TransaccionConCategoria {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  note: string;
  date: string;
  categories: CategoriaJoin | null;
}

// Forma que PolarChart de Victory Native necesita: label, value, color
// La firma de índice [key: string] es requerida por los genéricos de PolarChart
export interface GastoPorCategoria {
  [key: string]: unknown;
  label: string;
  value: number;
  color: string;
}

export interface DatosMes {
  totalIngresos: number;
  totalGastos: number;
  balance: number;
  ultimasTransacciones: TransaccionConCategoria[];
  gastosPorCategoria: GastoPorCategoria[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// mes es 0-indexed (igual que JS Date: enero = 0, diciembre = 11)
export function useTransactions(año: number, mes: number) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosMes | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Rango del mes recibido en formato ISO para la query
      const primerDia = new Date(año, mes, 1).toISOString().split('T')[0];
      const ultimoDia = new Date(año, mes + 1, 0).toISOString().split('T')[0];

      // Join a categories: Supabase expande la FK automáticamente con esta sintaxis
      const { data: txs, error: errDB } = await supabase
        .from('transactions')
        .select('id, amount, type, note, date, categories(name, color, icon)')
        .eq('user_id', user.id)
        .gte('date', primerDia)
        .lte('date', ultimoDia)
        .order('date', { ascending: false });

      if (errDB) throw errDB;

      const lista = (txs ?? []) as unknown as TransaccionConCategoria[];

      // Un solo recorrido para calcular totales y agrupar por categoría
      let totalIngresos = 0;
      let totalGastos = 0;
      const acum: Record<string, GastoPorCategoria> = {};

      for (const tx of lista) {
        if (tx.type === 'income') {
          totalIngresos += tx.amount;
        } else {
          totalGastos += tx.amount;

          const nombre = tx.categories?.name ?? 'Sin categoría';
          const color  = tx.categories?.color ?? '#9CA3AF';
          if (!acum[nombre]) {
            acum[nombre] = { label: nombre, value: 0, color };
          }
          acum[nombre].value += tx.amount;
        }
      }

      setDatos({
        totalIngresos,
        totalGastos,
        balance: totalIngresos - totalGastos,
        ultimasTransacciones: lista.slice(0, 10),
        gastosPorCategoria: Object.values(acum),
      });
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error al cargar datos';
      setError(mensaje);
    } finally {
      setLoading(false);
    }
  }, [año, mes]); // re-ejecutar cada vez que cambia el periodo

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { loading, error, datos, refrescar: cargar };
}
