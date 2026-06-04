// hooks/useAjustes.ts
// Lógica de la pantalla Ajustes: carga email, user_settings y tarjetas del usuario.
// Expone funciones de guardado granulares — una por sección — para mantener la
// pantalla limpia de lógica de BD.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { CreditCard, UserSettings } from '../types';

// Estado local de una tarjeta con el flag de guardado en vuelo.
// Usamos una interfaz aparte para no mezclar estado de UI con el tipo de BD.
export interface TarjetaEditable {
  id: string;
  name: string;
  last_four: string | null;
  cycle_close_day: number;
  cycle_due_day: number;
  active: boolean;
  guardando: boolean;
}

export function useAjustes() {
  const [email, setEmail] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [tarjetas, setTarjetas] = useState<TarjetaEditable[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardandoSettings, setGuardandoSettings] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    setEmail(user.email ?? null);

    // Cargar configuración del usuario
    const { data: s } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (s) setSettings(s as UserSettings);

    // Cargar TODAS las tarjetas (activas e inactivas) — el usuario necesita
    // poder reactivar una tarjeta inactiva desde Ajustes.
    const { data: cards } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    setTarjetas(
      ((cards ?? []) as CreditCard[]).map(c => ({
        id: c.id,
        name: c.name,
        last_four: c.last_four,
        cycle_close_day: c.cycle_close_day,
        cycle_due_day: c.cycle_due_day,
        active: c.active,
        guardando: false,
      }))
    );

    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Edita el estado local de una tarjeta sin tocar la BD todavía.
  // El usuario puede cambiar varios campos y después presionar Guardar.
  function editarTarjeta(id: string, cambios: Partial<Omit<TarjetaEditable, 'id' | 'guardando'>>) {
    setTarjetas(prev => prev.map(t => t.id === id ? { ...t, ...cambios } : t));
  }

  // Persiste el estado actual de la tarjeta en la BD.
  async function guardarTarjeta(id: string) {
    const tarjeta = tarjetas.find(t => t.id === id);
    if (!tarjeta) return;

    // Marcar como guardando para mostrar spinner en esa fila
    setTarjetas(prev => prev.map(t => t.id === id ? { ...t, guardando: true } : t));

    await supabase
      .from('credit_cards')
      .update({
        name: tarjeta.name,
        cycle_close_day: tarjeta.cycle_close_day,
        cycle_due_day: tarjeta.cycle_due_day,
        active: tarjeta.active,
      })
      .eq('id', id);

    setTarjetas(prev => prev.map(t => t.id === id ? { ...t, guardando: false } : t));
  }

  // Persiste RUT, banco y tipo de cuenta en user_settings
  async function guardarDatosBancarios(rut: string, banco: string, cuenta: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setGuardandoSettings(true);

    await supabase
      .from('user_settings')
      .update({ payment_rut: rut, payment_bank: banco, payment_account: cuenta })
      .eq('user_id', user.id);

    // Actualización optimista: ya actualizamos la BD, reflejar en estado local
    setSettings(prev =>
      prev ? { ...prev, payment_rut: rut, payment_bank: banco, payment_account: cuenta } : null
    );

    setGuardandoSettings(false);
  }

  // Persiste el sueldo estimado en user_settings
  async function guardarSueldo(sueldo: number | null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setGuardandoSettings(true);

    await supabase
      .from('user_settings')
      .update({ estimated_salary: sueldo })
      .eq('user_id', user.id);

    setSettings(prev => prev ? { ...prev, estimated_salary: sueldo } : null);

    setGuardandoSettings(false);
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
  }

  return {
    email,
    settings,
    tarjetas,
    loading,
    guardandoSettings,
    editarTarjeta,
    guardarTarjeta,
    guardarDatosBancarios,
    guardarSueldo,
    cerrarSesion,
    refrescar: cargar,
  };
}
