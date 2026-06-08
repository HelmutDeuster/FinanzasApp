// server/testSync.ts
// Diagnóstico del scraper v3: valida la estructura del resultado sin guardar nada en Supabase.
// Correr con: npx ts-node server/testSync.ts

import dotenv from 'dotenv';
import path from 'path';
import { bchile } from 'open-banking-chile';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

function extraerLastFour(label: string): string | null {
  const match = label.match(/\*{4}(\d{4})/);
  return match ? match[1] : null;
}

async function main(): Promise<void> {
  const rut = process.env.BANCOCHILE_RUT;
  const password = process.env.BANCOCHILE_PASS;

  if (!rut || !password) {
    console.error('Faltan BANCOCHILE_RUT o BANCOCHILE_PASS en .env.local');
    process.exit(1);
  }

  console.log('Iniciando scraper (sin guardar nada en Supabase)...\n');

  const resultado = await bchile.scrape({
    rut,
    password,
    onProgress: (paso) => console.log(`  [progreso] ${paso}`),
  });

  console.log('\n═══════════════════════════════════════════════════');
  console.log('RESULTADO DEL SCRAPER');
  console.log('═══════════════════════════════════════════════════\n');

  if (!resultado.success) {
    console.error('El scraper reportó error:', resultado.error ?? '(sin mensaje)');
    process.exit(1);
  }

  // ─── Cuentas corrientes ──────────────────────────────────────────────────────
  const cuentas = resultado.accounts ?? [];
  console.log(`── CUENTAS (${cuentas.length}) ──────────────────────────────`);

  for (const cuenta of cuentas) {
    console.log(`  label:       ${cuenta.label ?? '(sin label)'}`);
    console.log(`  balance:     ${cuenta.balance !== undefined ? cuenta.balance.toLocaleString('es-CL') : '(no disponible)'}`);
    console.log(`  movimientos: ${cuenta.movements.length}`);

    if (cuenta.movements.length > 0) {
      const primer = cuenta.movements[0];
      console.log(`  primer mov:  date="${primer.date}" amount=${primer.amount} source="${primer.source}" card=${primer.card ? `"${primer.card}"` : 'undefined'}`);
    }
  }

  console.log();

  // ─── Tarjetas de crédito ─────────────────────────────────────────────────────
  const tarjetas = resultado.creditCards ?? [];
  console.log(`── TARJETAS DE CRÉDITO (${tarjetas.length}) ─────────────────`);

  for (const card of tarjetas) {
    const lastFour = extraerLastFour(card.label);
    const movimientos = card.movements ?? [];

    console.log(`\n  label:           ${card.label}`);
    console.log(`  last_four:       ${lastFour ?? '⚠ NO EXTRAÍDO — regex falló'}`);
    console.log(`  nextBillingDate: ${card.nextBillingDate ?? '(no disponible)'}`);
    console.log(`  nextDueDate:     ${card.nextDueDate ?? '(no disponible)'}`);

    if (card.national) {
      console.log(`  national:        used=${card.national.used.toLocaleString('es-CL')}  available=${card.national.available.toLocaleString('es-CL')}  total=${card.national.total.toLocaleString('es-CL')}`);
    } else {
      console.log(`  national:        (no disponible)`);
    }

    console.log(`  movimientos:     ${movimientos.length}`);

    // Detectar movimientos sin card definido
    const movsSinCard = movimientos
      .map((mov, i) => ({ i, card: mov.card }))
      .filter(({ card: c }) => !c);

    if (movsSinCard.length > 0) {
      console.log(`  ⚠ Movimientos sin card: índices ${movsSinCard.map(m => m.i).join(', ')} (${movsSinCard.length} de ${movimientos.length})`);
    } else if (movimientos.length > 0) {
      console.log(`  ✓ Todos los movimientos tienen card definido`);
    }

    // Muestra hasta 3 movimientos de muestra
    const muestras = movimientos.slice(0, 3);
    if (muestras.length > 0) {
      console.log(`  Muestra (${muestras.length} de ${movimientos.length}):`);
      for (const mov of muestras) {
        console.log(
          `    date="${mov.date}"  amount=${mov.amount}` +
          `  source="${mov.source}"` +
          `  card=${mov.card ? `"${mov.card}"` : 'undefined'}` +
          `  installments=${mov.installments ?? 'undefined'}`
        );
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`RESUMEN: ${cuentas.length} cuenta(s), ${tarjetas.length} tarjeta(s)`);

  const totalMovCC  = cuentas.reduce((s, c) => s + c.movements.length, 0);
  const totalMovsTC = tarjetas.reduce((s, c) => s + (c.movements ?? []).length, 0);
  console.log(`  Movimientos CC: ${totalMovCC}  |  Movimientos TC: ${totalMovsTC}  |  Total: ${totalMovCC + totalMovsTC}`);
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Error inesperado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
