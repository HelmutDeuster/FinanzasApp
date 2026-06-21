// hooks/useModoCuentaCC.ts
// Datos para la pestaña "Cuenta" del Home.
//
// Qué carga:
//   - Último saldo de cuenta corriente (account_snapshots más reciente)
//   - Ingresos y gastos CC del mes seleccionado (bank_source = 'account' o NULL = TXT)
//   - Historial del saldo para el gráfico (último snapshot de cada mes, hasta 8 meses)
//   - Últimas transacciones CC del mes

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { clasificar } from '../lib/balanceClassify';

const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_HISTORIAL = 7; // barras del gráfico

// Un punto del gráfico — un mes con su saldo
export interface SnapshotMes {
  idx: number;      // 0 = más antiguo — xKey numérico para CartesianChart
  label: string;    // "may" — etiqueta visual debajo del gráfico
  balance: number;
}

export interface TransaccionCC {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  note: string;
  date: string;
}

export interface DatosModoCuentaCC {
  saldoActual: number | null;
  syncedAt: string | null;           // ISO — para mostrar "actualizado hace X"
  ingresosMes: number;
  gastosMes: number;
  historialSaldo: SnapshotMes[];     // para el gráfico de barras
  ultimas: TransaccionCC[];
}

export function useModoCuentaCC(año: number, mes: number) {
  const [datos, setDatos] = useState<DatosModoCuentaCC | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // ── 1. Snapshots de saldo CC ──────────────────────────────────────────
    // Traemos los últimos N snapshots (uno por sync). El más reciente = saldo actual.
    // Los demás sirven para el gráfico.
    const { data: snapshots } = await supabase
      .from('account_snapshots')
      .select('balance, synced_at')
      .eq('user_id', user.id)
      .order('synced_at', { ascending: false })
      .limit(100);

    const ultimo = snapshots?.[0] ?? null;

    // Agrupar por mes: para cada mes-año, nos quedamos con el balance del snapshot
    // más reciente de ese mes (el array viene ordenado desc, entonces el primero que
    // encontremos por mes es el más reciente).
    const porMes = new Map<string, number>();
    for (const s of snapshots ?? []) {
      const d = new Date(s.synced_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!porMes.has(key)) porMes.set(key, s.balance); // primer = más reciente
    }

    // Construir el array del gráfico para los últimos MESES_HISTORIAL meses
    const historialSaldo: SnapshotMes[] = [];
    for (let i = MESES_HISTORIAL - 1; i >= 0; i--) {
      const d = new Date(año, mes - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const balance = porMes.get(key);
      // Solo agregamos meses con datos — no rellenamos con 0 para no confundir
      if (balance !== undefined) {
        historialSaldo.push({
          idx: historialSaldo.length,
          label: MESES_CORTOS[d.getMonth()],
          balance,
        });
      }
    }

    // ── 2. Transacciones CC del mes seleccionado ──────────────────────────
    // Filtramos estrictamente bank_source = 'account'.
    // El valor 'account' es como open-banking-chile etiqueta los movimientos
    // de cuenta corriente (el usuario lo llama 'checking', mismo concepto).
    //
    // Por qué NO incluimos bank_source IS NULL:
    //   Las transacciones importadas desde TXT tienen bank_source = NULL
    //   pero pueden incluir gastos de TC — sin ese campo no podemos
    //   distinguir CC de TC, así que las excluimos para evitar mezclar.
    const primerDia = new Date(año, mes, 1).toISOString().slice(0, 10);
    const ultimoDia = new Date(año, mes + 1, 0).toISOString().slice(0, 10);

    // bank_source = 'account' → open-banking CC (syncs futuros correctos)
    // bank_source IS NULL    → importado desde TXT (cartola CC)
    // El backfill de migración 002 metió todo lo de open-banking como
    // credit_card_unbilled (incluyendo movimientos CC), así que hoy los
    // únicos datos de CC son los del TXT (NULL). Cuando haya syncs nuevos
    // post-migración, 'account' también aparecerá.
    const { data: txData } = await supabase
      .from('transactions')
      .select('id, amount, type, note, date, bank_source')
      .eq('user_id', user.id)
      .or('bank_source.eq.account,bank_source.is.null')
      .gte('date', primerDia)
      .lte('date', ultimoDia)
      .order('date', { ascending: false });

    let ingresosMes = 0;
    let gastosMes = 0;
    const ultimas: TransaccionCC[] = [];

    for (const tx of txData ?? []) {
      const monto = Number(tx.amount);
      // Misma clasificación que el Balance: el pago de la tarjeta y los traspasos
      // entre cuentas propias no son gasto/ingreso real; el aporte a Fintual es ahorro.
      const cat = clasificar({ type: tx.type, bank_source: tx.bank_source, note: tx.note });
      if (cat === 'ingreso') ingresosMes += monto;
      else if (cat === 'egreso_cc') gastosMes += monto;
      // La lista 'ultimas' sigue mostrando TODOS los movimientos de la cuenta,
      // sin filtrar, para que el usuario vea el extracto completo.
      if (ultimas.length < 15) {
        ultimas.push({
          id: tx.id,
          amount: monto,
          type: tx.type,
          note: tx.note,
          date: tx.date,
        });
      }
    }

    setDatos({
      saldoActual: ultimo?.balance ?? null,
      syncedAt: ultimo?.synced_at ?? null,
      ingresosMes,
      gastosMes,
      historialSaldo,
      ultimas,
    });
    setLoading(false);
  }, [año, mes]);

  useEffect(() => { cargar(); }, [cargar]);

  return { datos, loading, refrescar: cargar };
}
