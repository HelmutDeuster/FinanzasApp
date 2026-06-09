// server/debugSync.ts
// Corre el scraper y guarda el resultado completo en /tmp/scraper_output.json.
// No toca Supabase. Útil para inspeccionar card_last_four y estructura de movimientos.
// Correr con: npx ts-node server/debugSync.ts

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { bchile } from 'open-banking-chile';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const OUTPUT_PATH = '/tmp/scraper_output.json';

async function main(): Promise<void> {
  const rut      = process.env.BANCOCHILE_RUT;
  const password = process.env.BANCOCHILE_PASS;

  if (!rut || !password) {
    console.error('Faltan BANCOCHILE_RUT o BANCOCHILE_PASS en .env.local');
    process.exit(1);
  }

  console.log('Scraping (sin tocar Supabase)...\n');

  const resultado = await bchile.scrape({
    rut,
    password,
    onProgress: (paso) => process.stdout.write(`  ${paso}\r`),
  });

  // Limpiar la línea de progreso
  process.stdout.write('\n');

  if (!resultado.success) {
    console.error('Error del scraper:', resultado.error ?? '(sin mensaje)');
    process.exit(1);
  }

  // ── Guardar resultado completo ─────────────────────────────────────────────
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(resultado, null, 2), 'utf-8');
  console.log(`JSON completo guardado en ${OUTPUT_PATH}\n`);

  // ── Resumen en consola ─────────────────────────────────────────────────────
  const cuentas  = resultado.accounts    ?? [];
  const tarjetas = resultado.creditCards ?? [];

  const movsCC = cuentas.reduce((s, c) => s + (c.movements?.length ?? 0), 0);
  console.log(`Cuentas: ${cuentas.length}, movimientos: ${movsCC}`);

  console.log(`Tarjetas: ${tarjetas.length}`);
  for (const card of tarjetas) {
    const movs = card.movements?.length ?? 0;
    console.log(`  ${card.label}  →  ${movs} movimiento${movs !== 1 ? 's' : ''}`);
  }
}

main().catch((err) => {
  console.error('Error inesperado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
