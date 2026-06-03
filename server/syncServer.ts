// server/syncServer.ts
// Servidor Express local — puente entre la app y el scraper de Banco de Chile.
// Escucha SOLO en 127.0.0.1 (nunca en 0.0.0.0) para que sea inaccesible
// desde otras máquinas de la red.
//
// Arrancar con: npx ts-node server/syncServer.ts

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { sincronizarBancoChile } from './bchileSync';

// Cargar .env.local desde la raíz del proyecto antes de cualquier otra cosa.
// BANCOCHILE_RUT y BANCOCHILE_PASS deben estar definidos ahí.
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const app = express();
app.use(express.json());

// CORS restringido a los puertos que usa Expo en web
// Si tu app corre en otro puerto, agrégalo aquí
const ORIGENES_PERMITIDOS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
];

app.use(
  cors({
    origin: ORIGENES_PERMITIDOS,
    methods: ['POST', 'GET'],
  })
);

// ─── POST /sync ───────────────────────────────────────────────────────────────
// Ejecuta el scraper y devuelve los movimientos convertidos al formato de la app.
// La app los guarda en Supabase con su propia sesión de usuario.
app.post('/sync', async (_req, res) => {
  console.log('[sync] Iniciando sincronización con Banco de Chile...');
  const inicio = Date.now();

  try {
    const movimientos = await sincronizarBancoChile((paso) => {
      // Logueamos el progreso del scraper en la terminal del servidor.
      // Esto NO se envía al cliente — solo sirve para depurar.
      console.log(`[sync] ${paso}`);
    });

    const duracion = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`[sync] Completado en ${duracion}s — ${movimientos.length} movimientos`);

    res.json({ ok: true, movimientos });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido';

    // Error de autenticación — devolvemos 401 con mensaje genérico
    // NUNCA incluir el RUT ni la clave en la respuesta
    if (mensaje === 'AUTH_ERROR') {
      console.error('[sync] Error de autenticación (credenciales incorrectas)');
      res.status(401).json({
        ok: false,
        error: 'Las credenciales del banco son incorrectas. Verifica tu .env.local',
      });
      return;
    }

    // Cualquier otro error — también genérico hacia el cliente
    console.error('[sync] Error:', mensaje);
    res.status(500).json({
      ok: false,
      error: 'No se pudo sincronizar con el banco. Revisa la terminal para más detalles.',
    });
  }
});

// ─── GET /ping ────────────────────────────────────────────────────────────────
// La app lo usa antes de sincronizar para verificar que el servidor está corriendo.
app.get('/ping', (_req, res) => {
  res.json({ ok: true });
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
const PUERTO = 3001;

// Forzar 127.0.0.1 — el servidor nunca debe aceptar conexiones externas
app.listen(PUERTO, '127.0.0.1', () => {
  console.log(`\nServidor de sincronización listo en http://127.0.0.1:${PUERTO}`);
  console.log('Esperando solicitudes de la app...\n');
});
