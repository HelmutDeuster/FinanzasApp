// hooks/useCreditCards.ts
// Carga las tarjetas de crédito activas del usuario desde Supabase.
//
// Diseño:
//   - Es un hook independiente para que pueda ser usado en Home, Ajustes y
//     Proyección sin duplicar la query.
//   - useModoTarjeta lo compone internamente.
//   - Re-exporta las utilidades de ciclo de lib/cycleUtils.ts como punto de
//     entrada único para los consumidores de este feature (evita imports dobles).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { CreditCard } from '../types';

// Re-exportar utilidades de ciclo — los componentes importan desde aquí
// en lugar de ir directamente a cycleUtils (un punto de entrada por feature).
export { getCycleRange, formatearRangoCiclo as formatCycleLabel } from '../lib/cycleUtils';

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('created_at', { ascending: true });

    setCards((data ?? []) as CreditCard[]);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return { cards, loading, refrescar: cargar };
}
