// hooks/useBalanceMensual.ts
// Balance mensual para el Bloque 1 del Home (Modo Tarjeta).
// Acepta año y mes como parámetros para que el usuario pueda navegar entre meses.
//
// Ecuación: Ingresos = Ahorro + Egresos
//   Egresos TC  → bank_source 'credit_card_unbilled' | 'credit_card_billed'
//   Egresos CC  → bank_source NULL (TXT) o 'account' (open-banking cuenta)
//   Ahorro      → Ingresos − Egresos (residuo; puede ser negativo)

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

export function useBalanceMensual(año: number, mes: number) {
  const [datos, setDatos] = useState<DatosBalanceMensual | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Rango del mes recibido como parámetro (1er día → último día)
    const primerDia = new Date(año, mes, 1).toISOString().slice(0, 10);
    const ultimoDia = new Date(año, mes + 1, 0).toISOString().slice(0, 10);

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
        egresosCC += monto;
      }
    }

    const egresos = egresosTc + egresosCC;
    const ahorro  = ingresos - egresos;

    setDatos({ ingresos, egresosTc, egresosCC, egresos, ahorro });
    setLoading(false);
  }, [año, mes]);

  useEffect(() => { cargar(); }, [cargar]);

  return { datos, loading, refrescar: cargar };
}
