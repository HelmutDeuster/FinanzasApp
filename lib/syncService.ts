// lib/syncService.ts
// Servicio de sincronización — conecta la app con el servidor local (puerto 3001),
// guarda movimientos en Supabase y actualiza los datos de cada tarjeta.
//
// Flujo:
//   1. Verifica sesión activa
//   2. Verifica que el servidor responde (/ping)
//   3. Llama a POST /sync → { movimientos, tarjetas, saldo }
//   4. Upsert de tarjetas de crédito (cupos, fechas de facturación)
//   5. Guarda snapshot del saldo de cuenta corriente
//   6. Importa movimientos con deduplicación

import { supabase } from './supabase';
import { importarTransacciones } from './importService';
import type { TransaccionParaGuardar, CreditCardSyncData, ResultadoImportacion } from '../types';

const SERVIDOR_URL = 'http://127.0.0.1:3001';

// Formato de la respuesta del servidor POST /sync
interface RespuestaSync {
  ok: boolean;
  movimientos?: Omit<TransaccionParaGuardar, 'user_id'>[];
  tarjetas?: CreditCardSyncData[];
  saldo?: number;
  error?: string;
}

// ─── Verificar servidor ───────────────────────────────────────────────────────
async function verificarServidor(): Promise<void> {
  try {
    const respuesta = await fetch(`${SERVIDOR_URL}/ping`, { method: 'GET' });
    if (!respuesta.ok) throw new Error('ping fallido');
  } catch {
    throw new Error(
      'El servidor de sincronización no está corriendo.\n' +
      'En una terminal, ejecuta: npx ts-node server/syncServer.ts'
    );
  }
}

// ─── Conversión de nextBillingDate ───────────────────────────────────────────
// El scraper entrega "22 de junio" — convertimos a ISO ("2026-06-22") para poder
// calcular días restantes directamente y actualizar cycle_close_day.
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function parsearNextBillingDate(texto: string): { iso: string; dia: number } | null {
  const m = texto.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóúü]+)/);
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mesIdx = MESES_ES.indexOf(m[2]);
  if (mesIdx === -1 || isNaN(dia) || dia < 1 || dia > 31) return null;

  const hoy = new Date();
  let año = hoy.getFullYear();
  // Si la fecha de este año ya pasó, es del año siguiente
  if (new Date(año, mesIdx, dia) < hoy) año++;

  const iso = `${año}-${String(mesIdx + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return { iso, dia };
}

// ─── Upsert de tarjetas de crédito ───────────────────────────────────────────
// Estrategia:
//   - Si la tarjeta ya existe (por last_four): actualiza cupos, fecha de facturación
//     y cycle_close_day (el banco es la fuente autoritativa del día de cierre).
//   - Si la tarjeta es nueva: la inserta con cycle_close_day del banco.
//   - No toca name, cycle_due_day ni active para respetar configuración del usuario.
async function upsertTarjetas(userId: string, tarjetas: CreditCardSyncData[]): Promise<void> {
  for (const t of tarjetas) {
    // Convertir "22 de junio" → { iso: "2026-06-22", dia: 22 }
    const billingInfo = t.next_billing_date
      ? parsearNextBillingDate(t.next_billing_date)
      : null;

    const camposCupo = {
      used_clp:          t.used_clp,
      available_clp:     t.available_clp,
      total_clp:         t.total_clp,
      used_usd:          t.used_usd,
      available_usd:     t.available_usd,
      total_usd:         t.total_usd,
      // Guardar como ISO para poder calcular días restantes directamente
      next_billing_date: billingInfo?.iso ?? t.next_billing_date,
      billing_period:    t.billing_period,
      last_synced_at:    new Date().toISOString(),
      source:            'open-banking' as const,
    };

    const { data: existente } = await supabase
      .from('credit_cards')
      .select('id')
      .eq('user_id', userId)
      .eq('last_four', t.last_four)
      .maybeSingle();

    if (existente) {
      await supabase
        .from('credit_cards')
        .update({
          ...camposCupo,
          // El banco conoce el día de cierre — actualizarlo en cada sync
          ...(billingInfo ? { cycle_close_day: billingInfo.dia } : {}),
        })
        .eq('id', existente.id);
    } else {
      const nombreLimpio = t.label.replace(/\s*\*{4}\d{4}.*$/, '').trim();

      await supabase.from('credit_cards').insert({
        user_id:         userId,
        last_four:       t.last_four,
        name:            nombreLimpio,
        cycle_close_day: billingInfo?.dia ?? 23,
        cycle_due_day:   6,
        active:          true,
        ...camposCupo,
      });
    }
  }
}

// ─── Función principal ────────────────────────────────────────────────────────
export async function sincronizar(): Promise<ResultadoImportacion> {
  // Paso 1: sesión activa
  const { data: { user }, error: errorAuth } = await supabase.auth.getUser();
  if (errorAuth || !user) {
    throw new Error('No hay sesión activa. Por favor inicia sesión nuevamente.');
  }

  // Paso 2: servidor disponible
  await verificarServidor();

  // Paso 3: obtener datos del banco
  let respuestaHttp: Response;
  try {
    respuestaHttp = await fetch(`${SERVIDOR_URL}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch {
    throw new Error(
      'Error de conexión con el servidor local. ' +
      'Asegúrate de que está corriendo con: npx ts-node server/syncServer.ts'
    );
  }

  const datos: RespuestaSync = await respuestaHttp.json();

  if (!datos.ok) {
    if (respuestaHttp.status === 401) {
      throw new Error(
        datos.error ?? 'Error de autenticación con el banco. Verifica tus credenciales en .env.local'
      );
    }
    throw new Error(datos.error ?? 'Error al sincronizar con el banco');
  }

  const movimientos = datos.movimientos ?? [];
  const tarjetas   = datos.tarjetas    ?? [];
  const saldo      = datos.saldo       ?? 0;

  // Paso 4: upsert de tarjetas (cupos y fechas de facturación)
  if (tarjetas.length > 0) {
    await upsertTarjetas(user.id, tarjetas);
  }

  // Paso 5: guardar snapshot del saldo de cuenta corriente
  // saldo = 0 indica que el scraper no pudo leerlo — no guardar en ese caso
  if (saldo > 0) {
    await supabase.from('account_snapshots').insert({
      user_id:   user.id,
      balance:   saldo,
      synced_at: new Date().toISOString(),
    });
  }

  // Paso 6: importar movimientos con deduplicación
  if (movimientos.length === 0) {
    return { total: 0, importadas: 0, duplicadas: 0, errores: 0 };
  }

  const transacciones: TransaccionParaGuardar[] = movimientos.map(mov => ({
    ...mov,
    user_id: user.id,
  }));

  return importarTransacciones(transacciones);
}
