// lib/syncService.ts
// Servicio de sincronización — conecta la app con el servidor local (puerto 3001)
// y guarda los movimientos en Supabase usando el importarTransacciones existente.

import { supabase } from './supabase';
import { importarTransacciones } from './importService';
import type { TransaccionParaGuardar, ResultadoImportacion } from '../types';

const SERVIDOR_URL = 'http://127.0.0.1:3001';

// Formato que devuelve el servidor en POST /sync
interface RespuestaSync {
  ok: boolean;
  movimientos?: Omit<TransaccionParaGuardar, 'user_id'>[];
  error?: string;
}

// ─── Verificar servidor ───────────────────────────────────────────────────────
// Comprueba si el servidor local está corriendo antes de intentar sincronizar.
// Falla rápido con un mensaje de ayuda claro en lugar del error de red genérico.
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
// 1. Verifica que hay sesión activa en Supabase
// 2. Verifica que el servidor local responde
// 3. Llama a POST /sync para obtener los movimientos del banco
// 4. Añade el user_id a cada transacción
// 5. Llama a importarTransacciones (ya maneja deduplicación)
export async function sincronizar(): Promise<ResultadoImportacion> {
  // Paso 1: sesión activa
  const { data: { user }, error: errorAuth } = await supabase.auth.getUser();
  if (errorAuth || !user) {
    throw new Error('No hay sesión activa. Por favor inicia sesión nuevamente.');
  }

  // Paso 2: servidor disponible
  await verificarServidor();

  // Paso 3: obtener movimientos del banco
  let respuestaHttp: Response;
  try {
    respuestaHttp = await fetch(`${SERVIDOR_URL}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Sin body por ahora — en el futuro podría incluir filtros de fecha
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
      // Error de autenticación bancaria — mensaje ya genérico desde el servidor
      throw new Error(
        datos.error ?? 'Error de autenticación con el banco. Verifica tus credenciales en .env.local'
      );
    }
    throw new Error(datos.error ?? 'Error al sincronizar con el banco');
  }

  const movimientos = datos.movimientos ?? [];

  if (movimientos.length === 0) {
    return { total: 0, importadas: 0, duplicadas: 0, errores: 0 };
  }

  // Paso 4: añadir user_id (el servidor no lo conoce — solo la app tiene la sesión)
  const transacciones: TransaccionParaGuardar[] = movimientos.map((mov) => ({
    ...mov,
    user_id: user.id,
  }));

  // Paso 5: importar con deduplicación (misma lógica que el importador TXT)
  return importarTransacciones(transacciones);
}
