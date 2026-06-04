// lib/cycleUtils.ts
// Utilidades para calcular y formatear ciclos de facturación de tarjetas.
// Cada tarjeta tiene su propio cycle_close_day (1–31).

// ─── Cálculo del ciclo activo ─────────────────────────────────────────────────
// Dado el día de cierre de una tarjeta, devuelve el inicio y fin del ciclo actual.
//
// Regla:
//   Si hoy <= closeDay → el cierre es este mes     → ciclo: (closeDay+1) del mes pasado → closeDay de este mes
//   Si hoy >  closeDay → el cierre es el mes que viene → ciclo: (closeDay+1) de este mes → closeDay del próximo
//
// Ejemplo con closeDay=23:
//   Hoy 10 jun → ciclo 24 may → 23 jun
//   Hoy 25 jun → ciclo 24 jun → 23 jul
export function getCycleRange(closeDay: number): { start: Date; end: Date } {
  const today = new Date();
  const currentDay = today.getDate();

  let cycleEnd: Date;
  if (currentDay <= closeDay) {
    cycleEnd = new Date(today.getFullYear(), today.getMonth(), closeDay);
  } else {
    cycleEnd = new Date(today.getFullYear(), today.getMonth() + 1, closeDay);
  }

  // El inicio es el día siguiente al cierre, del mes anterior al cierre
  const cycleStart = new Date(
    cycleEnd.getFullYear(),
    cycleEnd.getMonth() - 1,
    closeDay + 1
  );

  return { start: cycleStart, end: cycleEnd };
}

// ─── Formato de etiquetas ─────────────────────────────────────────────────────
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function formatearFechaCiclo(d: Date): string {
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

// Devuelve "24 may → 23 jun"
export function formatearRangoCiclo(start: Date, end: Date): string {
  return `${formatearFechaCiclo(start)} → ${formatearFechaCiclo(end)}`;
}

// ─── Progreso del ciclo ───────────────────────────────────────────────────────
// Devuelve un número entre 0 y 100 indicando qué porcentaje del ciclo ha transcurrido.
// Útil para la barra temporal del Home.
export function progresoCiclo(start: Date, end: Date): number {
  const now = new Date();
  const total = end.getTime() - start.getTime();
  const transcurrido = now.getTime() - start.getTime();
  return Math.min(100, Math.max(0, Math.round((transcurrido / total) * 100)));
}

// ─── Días restantes ───────────────────────────────────────────────────────────
export function diasRestantes(end: Date): number {
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ─── Conversión de rango a strings ISO para queries Supabase ─────────────────
export function cicloAIso(start: Date, end: Date): { startISO: string; endISO: string } {
  return {
    startISO: start.toISOString().slice(0, 10),
    endISO:   end.toISOString().slice(0, 10),
  };
}
