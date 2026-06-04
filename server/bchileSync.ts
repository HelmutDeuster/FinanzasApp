// server/bchileSync.ts
// Adaptador entre open-banking-chile y el formato de transacciones de FinanzasApp.
// Toda la lógica de conversión de datos del banco vive aquí.

import { bchile } from 'open-banking-chile';
import type { BankMovement, ScrapeResult } from 'open-banking-chile';
import type { TransaccionParaGuardar } from '../types';

// ─── Conversión de fecha ──────────────────────────────────────────────────────
// open-banking-chile devuelve "dd-mm-yyyy"; Supabase necesita "yyyy-mm-dd"
function convertirFecha(fechaBanco: string): string {
  const [dia, mes, anio] = fechaBanco.split('-');
  return `${anio}-${mes}-${dia}`;
}

// ─── Construcción de la nota ──────────────────────────────────────────────────
// Si la transacción es en cuotas, lo añadimos a la descripción para que sea
// visible en la pantalla Home sin necesidad de columnas extra en la BD.
//
// Mejora detectada: las cuotas "01/01" son pago único — las omitimos para no
// contaminar la nota con información sin valor.
function construirNota(mov: BankMovement): string {
  let nota = mov.description.trim();

  if (mov.installments && mov.installments !== '01/01') {
    nota += ` [cuota ${mov.installments}]`;
  }

  return nota;
}

// ─── Conversión de movimientos ────────────────────────────────────────────────
// Convierte el formato del banco al formato de TransaccionParaGuardar.
// No incluye user_id — lo añade el cliente al recibir la respuesta del servidor.
//
// bank_source mapea el campo 'source' de open-banking-chile a nuestra columna
// homónima, que distingue cuenta corriente de tarjeta de crédito:
//   'account'               → cuenta corriente/vista
//   'credit_card_unbilled'  → tarjeta no facturada (ciclo abierto)
//   'credit_card_billed'    → tarjeta facturada
function convertirMovimiento(
  mov: BankMovement
): Omit<TransaccionParaGuardar, 'user_id'> {
  return {
    category_id: null,
    // open-banking-chile: positivo = abono (ingreso), negativo = cargo (gasto)
    amount: Math.abs(mov.amount),
    type: mov.amount >= 0 ? 'income' : 'expense',
    note: construirNota(mov),
    date: convertirFecha(mov.date),
    source: 'open-banking',
    bank_source: mov.source, // 'account' | 'credit_card_unbilled' | 'credit_card_billed'
  };
}

// ─── Detección de errores de autenticación ────────────────────────────────────
// Identificamos si el fallo viene de credenciales incorrectas para devolver
// un mensaje genérico al usuario (sin revelar cuál campo fue incorrecto).
function esErrorDeAutenticacion(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return (
    m.includes('credencial') ||
    m.includes('clave') ||
    m.includes('contraseña') ||
    m.includes('rut') ||
    m.includes('login') ||
    m.includes('autenticac')
  );
}

// ─── Función principal ────────────────────────────────────────────────────────
// onProgreso: callback opcional para mostrar en los logs del servidor qué paso
// está ejecutando el scraper (abre Chrome, navega a la web del banco, etc.)
export async function sincronizarBancoChile(
  onProgreso?: (paso: string) => void
): Promise<Omit<TransaccionParaGuardar, 'user_id'>[]> {
  const rut = process.env.BANCOCHILE_RUT;
  const password = process.env.BANCOCHILE_PASS;

  // Verificar credenciales antes de abrir Chrome
  if (!rut || !password) {
    throw new Error(
      'Faltan credenciales. Agrega BANCOCHILE_RUT y BANCOCHILE_PASS en .env.local'
    );
  }

  let resultado: ScrapeResult;

  try {
    resultado = await bchile.scrape({
      rut,
      password,
      onProgress: onProgreso,
      // Si el banco pide código 2FA, el scraper leerá de stdin (la terminal donde
      // corre el servidor). Escribe el código allí cuando te lo solicite.
    });
  } catch (error) {
    // Error de red o de Chrome (no del banco)
    const mensaje = error instanceof Error ? error.message : 'Error al ejecutar el scraper';
    throw new Error(`Error del scraper: ${mensaje}`);
  }

  if (!resultado.success) {
    const mensajeError = resultado.error ?? 'Error desconocido del scraper';

    if (esErrorDeAutenticacion(mensajeError)) {
      // Lanzamos un error con un identificador claro para que syncServer.ts
      // lo detecte y devuelva un mensaje genérico al cliente
      throw new Error('AUTH_ERROR');
    }

    throw new Error(`El scraper no pudo obtener movimientos: ${mensajeError}`);
  }

  // Mejora detectada: ScrapeResult también incluye:
  // - resultado.balance: saldo actual de la cuenta corriente
  // - resultado.creditCards: saldos y cupos de cada tarjeta de crédito
  // Estos datos no se guardan en la BD por ahora pero son útiles para el futuro
  // (pantalla de saldos, alertas de cupo, etc.)

  return resultado.movements.map(convertirMovimiento);
}
