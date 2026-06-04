// hooks/useSimulador.ts
// Estado local del simulador "¿y si?" — sin llamadas a BD.
// Recibe los valores base de useProyeccion y permite simular cambios.
// Como no persiste en BD, el estado se resetea al desmontar la pantalla.

import { useState, useEffect } from 'react';

export type TabSimulador = 'sueldo' | 'gasto_extra' | 'meta_ahorro';

export interface DatosSimulador {
  tab: TabSimulador;
  sueldoSim: number;
  gastoExtra: number;
  metaAhorro: number;
  // cuánto queda después de TC + fijos ± ajustes del tab activo
  disponible: number;
  // Para tab meta_ahorro: ¿el disponible cubre la meta?
  cumpliMeta: boolean;
  faltaParaMeta: number;
}

export function useSimulador(sueldoBase: number, tcCiclo: number, fijosTotal: number) {
  const [tab, setTab] = useState<TabSimulador>('sueldo');
  const [sueldoSim, setSueldoSim] = useState(sueldoBase);
  const [gastoExtra, setGastoExtra] = useState(0);
  const [metaAhorro, setMetaAhorro] = useState(0);

  // Sincronizar sueldoSim cuando carga el sueldo base (arranca en 0 hasta que llega de BD)
  useEffect(() => {
    if (sueldoBase > 0) setSueldoSim(sueldoBase);
  }, [sueldoBase]);

  // disponibleBase: margen antes de aplicar el ajuste del tab activo
  const disponibleBase = sueldoSim - tcCiclo - fijosTotal;

  // Solo el tab "gasto_extra" resta el gasto extra del disponible
  const disponible = disponibleBase - (tab === 'gasto_extra' ? gastoExtra : 0);

  const faltaParaMeta = Math.max(0, metaAhorro - disponibleBase);
  // cumpliMeta = true solo si el usuario fijó una meta y el sueldo la cubre
  const cumpliMeta = metaAhorro > 0 && faltaParaMeta === 0;

  const datos: DatosSimulador = {
    tab,
    sueldoSim,
    gastoExtra,
    metaAhorro,
    disponible,
    cumpliMeta,
    faltaParaMeta,
  };

  return {
    datos,
    setTab,
    setSueldoSim,
    setGastoExtra,
    setMetaAhorro,
    // Suma un delta al gasto extra (para los botones rápidos +100K / +200K / +500K)
    agregarGastoExtra: (delta: number) => setGastoExtra(prev => Math.max(0, prev + delta)),
  };
}
