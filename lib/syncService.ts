// lib/syncService.ts
// Servicio de sincronización — conecta la app con el servidor local (puerto 3001).
//
// Flujo:
//   1. Verifica sesión activa
//   2. Verifica que el servidor responde (/ping)
//   3. Llama a POST /sync con user_id → el servidor hace scrape, upsert de
//      tarjetas y snapshot de saldo directamente en Supabase (service_role)
//   4. Importa las transacciones recibidas con deduplicación

import { supabase } from './supabase';
import { importarTransacciones } from './importService';
import type { TransaccionParaGuardar, ResultadoImportacion } from '../types';

const SERVIDOR_URL = 'http://127.0.0.1:3001';

interface RespuestaSync {
  ok: boolean;
  movimientos?: Omit<TransaccionParaGuardar, 'user_id'>[];
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

// ─── Función principal ────────────────────────────────────────────────────────
export async function sincronizar(): Promise<ResultadoImportacion> {
  // Paso 1: sesión activa
  // Necesitamos la sesión completa (no solo el usuario) para enviar el access_token
  // al servidor. El servidor valida ese token y deriva el user_id de ahí, en vez de
  // confiar en un id que mandemos en el cuerpo de la petición.
  const { data: { session }, error: errorAuth } = await supabase.auth.getSession();
  if (errorAuth || !session) {
    throw new Error('No hay sesión activa. Por favor inicia sesión nuevamente.');
  }
  const user = session.user;

  // Paso 2: servidor disponible
  await verificarServidor();

  // Paso 3: obtener movimientos del banco
  // El servidor hace el scrape, upsert de tarjetas y snapshot de saldo.
  let respuestaHttp: Response;
  try {
    respuestaHttp = await fetch(`${SERVIDOR_URL}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
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

  // [DIAG] cuántos movimientos llegaron y cómo se ven los primeros 2
  console.log('[sync] movimientos recibidos del servidor:', movimientos.length);
  console.log('[sync] primeros 2 movimientos:', JSON.stringify(movimientos.slice(0, 2), null, 2));

  // Paso 4: importar movimientos con deduplicación
  if (movimientos.length === 0) {
    return { total: 0, importadas: 0, duplicadas: 0, errores: 0 };
  }

  const transacciones: TransaccionParaGuardar[] = movimientos.map(mov => ({
    ...mov,
    user_id: user.id,
  }));

  return importarTransacciones(transacciones);
}
