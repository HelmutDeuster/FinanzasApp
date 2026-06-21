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
import { clasificar } from '../lib/balanceClassify';

export interface DatosBalanceMensual {
  ingresos: number;
  egresosTc: number;    // gastos de tarjetas de crédito del mes
  egresosCC: number;    // débitos directos de cuenta corriente del mes
  egresos: number;      // egresosTc + egresosCC
  ahorro: number;       // ingresos − egresos (puede ser negativo)
}

type TxRow = {
  amount: number;
  type: 'income' | 'expense';
  bank_source: string | null;
  note: string;
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
      .select('amount, type, bank_source, note')
      .eq('user_id', user.id)
      .gte('date', primerDia)
      .lte('date', ultimoDia);

    let ingresos = 0;
    let egresosTc = 0;
    let egresosCC = 0;

    // Clasificamos por tipo económico (ver lib/balanceClassify): así excluimos
    // pagos/reversos de TC, traspasos entre cuentas propias y rescates de Fintual
    // (que no son ingreso/gasto real), y tratamos los aportes a Fintual como ahorro.
    for (const tx of (data ?? []) as unknown as TxRow[]) {
      const monto = Number(tx.amount);
      switch (clasificar(tx)) {
        case 'ingreso':   ingresos += monto; break;
        case 'egreso_tc': egresosTc += monto; break;
        case 'egreso_cc': egresosCC += monto; break;
        // 'ahorro' y 'ignorar' no entran en egresos → quedan reflejados en el
        // residuo (ahorro = ingresos − egresos).
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
