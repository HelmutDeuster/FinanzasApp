// Servicio de importación — guarda transacciones en Supabase evitando duplicados
// Separado del parser para que cada archivo tenga una sola responsabilidad

import { supabase } from './supabase';
import { TransaccionParaGuardar, ResultadoImportacion } from '../types';

// ¿Cómo evitamos duplicados?
// Estrategia: comparamos (user_id + date + amount + type + note)
// Si ya existe una transacción con esos 5 datos iguales, la ignoramos.
// No usamos el saldo porque podría cambiar, ni un ID del banco porque no lo tenemos.
// Esta estrategia cubre el 99% de los casos — un mismo cargo el mismo día
// con la misma descripción y monto es casi imposible que sea transacción distinta.

// Clave de deduplicación, usada de forma idéntica al consultar la BD y al
// filtrar el lote entrante (un solo lugar para no divergir).
//
// Incluye balance_after (saldo corrido después del movimiento) porque el banco
// NO entrega ID de transacción, hora ni número de operación. Dos transacciones
// reales idénticas el mismo día (ej. dos transferencias de $100.000 a Fintual)
// solo se distinguen por el saldo que dejan, que es determinístico y estable.
// Cuando no hay balance (TC trae 0, TXT trae NULL) este componente queda vacío
// y la clave se comporta como antes — no empeora ningún caso.
function claveDedup(t: {
  date: string; amount: number; type: string; note: string;
  installments?: string | null; balance_after?: number | null;
}): string {
  const bal = t.balance_after == null ? '' : String(Math.round(Number(t.balance_after)));
  return `${t.date}|${t.amount}|${t.type}|${t.note}|${t.installments ?? ''}|${bal}`;
}

// Verifica cuáles transacciones ya existen en la base de datos
// Devuelve un Set con claves únicas de las transacciones existentes
async function obtenerTransaccionesExistentes(
  userId: string,
  transacciones: TransaccionParaGuardar[]
): Promise<Set<string>> {
  if (transacciones.length === 0) return new Set();

  // Sacamos las fechas únicas del CSV para acotar la consulta
  // (así no pedimos TODAS las transacciones del usuario, solo el rango relevante)
  const fechas = [...new Set(transacciones.map(t => t.date))];

  const { data, error } = await supabase
    .from('transactions')
    .select('date, amount, type, note, installments, balance_after')
    .eq('user_id', userId)
    .in('date', fechas); // solo busca en las fechas que trae el CSV

  if (error) {
    console.error('Error consultando transacciones existentes:', error);
    throw new Error('No se pudo verificar duplicados: ' + error.message);
  }

  const existentes = new Set<string>();
  for (const t of data ?? []) {
    existentes.add(claveDedup(t as Parameters<typeof claveDedup>[0]));
  }

  return existentes;
}

// Función principal del servicio
// Recibe las transacciones parseadas y las guarda de forma inteligente
export async function importarTransacciones(
  transacciones: TransaccionParaGuardar[],
  onProgreso?: (progreso: number) => void // callback opcional para la barra de progreso
): Promise<ResultadoImportacion> {
  const resultado: ResultadoImportacion = {
    total: transacciones.length,
    importadas: 0,
    duplicadas: 0,
    errores: 0,
  };

  if (transacciones.length === 0) return resultado;

  // Paso 1: consultar qué ya existe en la BD
  const userId = transacciones[0].user_id;
  // [DIAG] userId que se usa para consultar y para insertar
  console.log('[import] userId:', userId);
  const existentes = await obtenerTransaccionesExistentes(userId, transacciones);
  // [DIAG] cuántas transacciones ya existían en las fechas del lote
  console.log('[import] existentes encontrados:', existentes.size, '| nuevas a insertar:', transacciones.length - existentes.size);

  // Paso 2: filtrar las nuevas (las que no están en existentes)
  const nuevas: TransaccionParaGuardar[] = [];

  for (const t of transacciones) {
    const clave = claveDedup(t);
    if (existentes.has(clave)) {
      resultado.duplicadas++;
    } else {
      nuevas.push(t);
      // Agregamos la clave al set para deduplicar también DENTRO del mismo lote.
      // Sin esto, el scraper puede traer el mismo movimiento billed bajo dos
      // tarjetas distintas en un solo sync y ambos se insertarían (la clave es
      // agnóstica a la tarjeta a propósito, para no contar dos veces el mismo gasto).
      existentes.add(clave);
    }
  }

  // Paso 3: insertar las nuevas en lotes de 50
  // ¿Por qué lotes? Supabase tiene límite de tamaño por request.
  // Insertar de a 50 es seguro y permite actualizar la barra de progreso.
  const TAMANO_LOTE = 50;
  const totalNuevas = nuevas.length;

  for (let i = 0; i < nuevas.length; i += TAMANO_LOTE) {
    const lote = nuevas.slice(i, i + TAMANO_LOTE);

    const { error } = await supabase
      .from('transactions')
      .insert(lote);

    if (error) {
      // [DIAG] error completo del lote — incluye code, message, details, hint
      console.error('[import] Error insertando lote (lote size:', lote.length, '):', JSON.stringify(error, null, 2));
      console.error('[import] Primer elemento del lote fallido:', JSON.stringify(lote[0], null, 2));
      resultado.errores += lote.length;
    } else {
      resultado.importadas += lote.length;
    }

    // Actualizar progreso si se pasó el callback
    // El progreso va del 0 al 100 según los lotes procesados
    if (onProgreso && totalNuevas > 0) {
      const porcentaje = Math.round(((i + lote.length) / totalNuevas) * 100);
      onProgreso(Math.min(porcentaje, 100));
    }
  }

  return resultado;
}
