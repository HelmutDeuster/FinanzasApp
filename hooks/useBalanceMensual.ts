// hooks/useBalanceMensual.ts
// Balance mensual para el Bloque 1 del Home.
// Implementa la ecuación contable: Ingresos = Ahorro + Egresos
//
// Clasificación de transacciones del mes actual:
//   Ingresos    → type = 'income'
//   Egresos TC  → type = 'expense' + bank_source de tarjeta de crédito
//   Egresos CC  → type = 'expense' + bank_source NULL o 'account' (cuenta corriente / TXT)
//   Ahorro      → Ingresos − Egresos (residuo; puede ser negativo)
//
// NOTA MVP: no existe clasificación "Fintual" en la BD todavía.
// El ahorro es el residuo de la ecuación. Se refinará en V2 con categorización.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface DatosBalanceMensual {
  ingresos: number;
  egresosTc: number;    // gastos de tarjetas de crédito del mes
  egresosCC: number;    // débitos directos de cuenta corriente del mes
  egresos: number;      // egresosTc + egresosCC
  ahorro: number;       // ingresos − egresos (puede ser negativo)
}

type TxRow = {
  amount: number;
  type: string;
  bank_source: string | null;
};

export function useBalanceMensual() {
  const [datos, setDatos] = useState<DatosBalanceMensual | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Rango del mes actual (1 → último día)
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      .toISOString().slice(0, 10);
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
      .toISOString().slice(0, 10);

    const { data } = await supabase
      .from('transactions')
      .select('amount, type, bank_source')
      .eq('user_id', user.id)
      .gte('date', primerDia)
      .lte('date', ultimoDia);

    let ingresos = 0;
    let egresosTc = 0;
    let egresosCC = 0;

    for (const tx of (data ?? []) as unknown as TxRow[]) {
      const monto = Number(tx.amount);
      if (tx.type === 'income') {
        ingresos += monto;
      } else if (
        tx.bank_source === 'credit_card_unbilled' ||
        tx.bank_source === 'credit_card_billed'
      ) {
        egresosTc += monto;
      } else {
        // Cuenta corriente directa (bank_source NULL = TXT, o 'account' = open-banking)
        egresosCC += monto;
      }
    }

    const egresos = egresosTc + egresosCC;
    const ahorro = ingresos - egresos;

    setDatos({ ingresos, egresosTc, egresosCC, egresos, ahorro });
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return { datos, loading, refrescar: cargar };
}
