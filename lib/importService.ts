// Servicio de importación — guarda transacciones en Supabase evitando duplicados
// Separado del parser para que cada archivo tenga una sola responsabilidad

import { supabase } from './supabase';
import { TransaccionParaGuardar, ResultadoImportacion } from '../types';

// ¿Cómo identificamos la MISMA transacción real entre syncs?
//
// Antes la clave incluía `note`. Se descubrió que el banco cambia el texto de
// la descripción cuando una compra de tarjeta pasa de "no facturada" a
// "facturada" (ej. "PURIA COFFEE BRUNC COMPRAS" → "PURIA COFFEE BRUNC SANTIAGO").
// Como `note` nunca coincidía entre ambos estados, cada re-sync insertaba una
// fila nueva en vez de actualizar bank_source de la existente — dejando
// docenas de filas duplicadas (ver auditoría de julio 2026).
//
// Clave estable, sin `note`: fecha + monto + tipo + tarjeta + cuotas + saldo.
//   - card_last_four: no cambia entre no-facturado/facturado (mismo movimiento,
//     misma tarjeta). NULL para movimientos de cuenta corriente.
//   - balance_after: se mantiene en la clave por una razón distinta a card —
//     para cuenta corriente distingue dos transferencias reales idénticas el
//     mismo día (ej. dos abonos de $100.000 de la misma persona). En TC este
//     campo siempre es 0 (verificado en datos reales), así que no interfiere
//     con el match no-facturado→facturado.
function claveMatch(t: {
  date: string; amount: number; type: string;
  card_last_four?: string | null; installments?: string | null; balance_after?: number | null;
}): string {
  const bal = t.balance_after == null ? '' : String(Math.round(Number(t.balance_after)));
  return `${t.date}|${t.amount}|${t.type}|${t.card_last_four ?? ''}|${t.installments ?? ''}|${bal}`;
}

// Candidato existente en la BD que podría corresponder a una transacción entrante
interface Candidato {
  id: string;
  bank_source: string | null;
  note: string;
}

// Trae las transacciones existentes en las fechas del lote entrante y las
// agrupa por claveMatch(). Puede haber más de un candidato por clave —
// ver el caso "CHOCO CHURROS SPA" / "TUU*CHOCO CHURROS S" en la auditoría:
// dos compras reales distintas coincidieron en fecha+monto+tarjeta. Por eso
// esto devuelve un array por clave en vez de un solo registro.
async function obtenerCandidatosExistentes(
  userId: string,
  transacciones: TransaccionParaGuardar[]
): Promise<Map<string, Candidato[]>> {
  const mapa = new Map<string, Candidato[]>();
  if (transacciones.length === 0) return mapa;

  // Sacamos las fechas únicas del lote para acotar la consulta
  // (así no pedimos TODAS las transacciones del usuario, solo el rango relevante)
  const fechas = [...new Set(transacciones.map(t => t.date))];

  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, amount, type, note, bank_source, installments, card_last_four, balance_after')
    .eq('user_id', userId)
    .in('date', fechas);

  if (error) {
    console.error('Error consultando transacciones existentes:', error);
    throw new Error('No se pudo verificar duplicados: ' + error.message);
  }

  for (const t of data ?? []) {
    const clave = claveMatch(t as Parameters<typeof claveMatch>[0]);
    const lista = mapa.get(clave) ?? [];
    lista.push({ id: t.id, bank_source: t.bank_source, note: t.note });
    mapa.set(clave, lista);
  }

  return mapa;
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
    actualizadas: 0,
    errores: 0,
  };

  if (transacciones.length === 0) return resultado;

  // Paso 1: consultar candidatos existentes en la BD, agrupados por clave
  const userId = transacciones[0].user_id;
  // [DIAG] userId que se usa para consultar y para insertar
  console.log('[import] userId:', userId);
  const candidatosPorClave = await obtenerCandidatosExistentes(userId, transacciones);

  // Paso 2: clasificar cada transacción entrante en 3 vías:
  //   - duplicada exacta (misma nota y mismo bank_source ya existen) → ignorar
  //   - actualización (1 solo candidato, pasó de no-facturado a facturado) → UPDATE
  //   - nueva (sin candidato, o candidatos ambiguos sin match exacto) → INSERT
  //
  // El caso ambiguo (más de 1 candidato) ocurre cuando dos compras reales
  // distintas coinciden en fecha+monto+tarjeta+cuotas+saldo (ver "CHOCO CHURROS
  // SPA" vs "TUU*CHOCO CHURROS S" en la auditoría). Ahí NO adivinamos cuál
  // actualizar — si no hay un match exacto por nota, se inserta como nueva,
  // igual que el comportamiento anterior (no empeora ese caso raro).
  const nuevas: TransaccionParaGuardar[] = [];
  const actualizaciones: { id: string; cambios: Partial<TransaccionParaGuardar> }[] = [];

  for (const t of transacciones) {
    const clave = claveMatch(t);
    const candidatos = candidatosPorClave.get(clave) ?? [];

    const duplicadoExacto = candidatos.find(
      c => c.note === t.note && c.bank_source === (t.bank_source ?? null)
    );
    if (duplicadoExacto) {
      resultado.duplicadas++;
      continue;
    }

    if (candidatos.length === 1) {
      const candidato = candidatos[0];
      if (candidato.bank_source === 'credit_card_unbilled' && t.bank_source === 'credit_card_billed' && candidato.id) {
        actualizaciones.push({
          id: candidato.id,
          cambios: {
            bank_source: t.bank_source,
            note: t.note,
            balance_after: t.balance_after ?? null,
            installments: t.installments ?? null,
          },
        });
        // Reflejamos el cambio en el candidato para que un segundo movimiento
        // del mismo lote con la misma clave lo vea ya actualizado.
        candidato.bank_source = t.bank_source;
        candidato.note = t.note;
        continue;
      }

      // bank_source distinto pero no es el upgrade esperado (ej. facturado →
      // no facturado, que no debería pasar) — no tocamos el dato existente
      // por seguridad, solo lo registramos para revisión manual.
      if (candidato.bank_source !== (t.bank_source ?? null)) {
        console.warn(
          '[import] bank_source inesperado, se ignora:', clave,
          candidato.bank_source, '->', t.bank_source
        );
      }
      resultado.duplicadas++;
      continue;
    }

    if (candidatos.length > 1) {
      console.warn('[import] Clave ambigua con', candidatos.length, 'candidatos — se inserta como nueva:', clave);
    }

    // Nueva transacción real — sin candidato exacto ni candidato único para actualizar
    nuevas.push(t);
    candidatosPorClave.set(clave, [...candidatos, { id: '', bank_source: t.bank_source ?? null, note: t.note }]);
  }

  // [DIAG] resumen de la clasificación
  console.log(
    '[import] nuevas:', nuevas.length,
    '| actualizaciones:', actualizaciones.length,
    '| duplicadas:', resultado.duplicadas
  );

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
    // El progreso va del 0 al 100 según los lotes procesados (inserciones primero,
    // actualizaciones después — ver más abajo)
    if (onProgreso && totalNuevas > 0) {
      const porcentaje = Math.round(((i + lote.length) / totalNuevas) * 100);
      onProgreso(Math.min(porcentaje, 100));
    }
  }

  // Paso 4: aplicar actualizaciones (no-facturado → facturado) una por una.
  // Son registros ya existentes identificados por id — no hay upsert por
  // clave natural posible porque no existe una constraint única sobre
  // (date, amount, type, card_last_four, installments, balance_after).
  for (const { id, cambios } of actualizaciones) {
    const { error } = await supabase
      .from('transactions')
      .update(cambios)
      .eq('id', id);

    if (error) {
      console.error('[import] Error actualizando transacción', id, ':', JSON.stringify(error, null, 2));
      resultado.errores++;
    } else {
      resultado.actualizadas++;
    }
  }

  return resultado;
}
