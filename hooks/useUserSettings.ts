// hooks/useUserSettings.ts
// Carga y persiste la configuración del usuario desde user_settings.
// Si no existe la fila (usuario nuevo), la crea con valores por defecto.
// El uso principal en esta sesión es persistir el toggle Tarjeta / Cuenta.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { UserSettings } from '../types';

const DEFAULTS: Omit<UserSettings, 'user_id'> = {
  default_close_day: 23,
  default_due_day: 6,
  estimated_salary: null,
  payment_rut: null,
  payment_bank: null,
  payment_account: null,
  home_mode: 'credit_card',
};

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(); // null si no existe la fila — no es un error

    if (!error && data) {
      setSettings(data as UserSettings);
    } else {
      // Primera vez: crear la fila con defaults y usarla inmediatamente
      const nuevos = { user_id: user.id, ...DEFAULTS };
      const { data: creados } = await supabase
        .from('user_settings')
        .insert(nuevos)
        .select()
        .single();
      if (creados) setSettings(creados as UserSettings);
    }

    setLoading(false);
  }

  // Cambia el modo del Home (Tarjeta / Cuenta) y lo persiste en la BD
  // Actualización optimista: la UI responde de inmediato sin esperar el round-trip
  async function actualizarModo(modo: 'credit_card' | 'checking') {
    setSettings(prev => prev ? { ...prev, home_mode: modo } : null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_settings')
      .update({ home_mode: modo, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  }

  return { settings, loading, actualizarModo };
}
