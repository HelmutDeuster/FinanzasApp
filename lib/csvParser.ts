// Parser de cartola TXT del Banco de Chile
// Formato: archivo de ancho fijo, 121 caracteres por línea
// Cada línea codifica: fecha + monto + tipo (A/C) + descripción
// Tipo A = Abono (ingreso), Tipo C = Cargo (gasto)

import { TransaccionParaGuardar } from '../types';

// Líneas que NO son transacciones reales — las filtramos
const LINEAS_A_IGNORAR = [
  'SALDO CONTABLE',
  'RETENCIONES',
];

// Convierte fecha YYYYMMDD → formato ISO "YYYY-MM-DD"
// Supabase requiere fechas en formato ISO para ordenarlas correctamente
function convertirFecha(fechaBanco: string): string {
  const anio = fechaBanco.slice(0, 4);
  const mes = fechaBanco.slice(4, 6);
  const dia = fechaBanco.slice(6, 8);
  return `${anio}-${mes}-${dia}`;
}

// Función principal: recibe el texto completo del TXT y devuelve transacciones listas para Supabase
// El formato del banco es de ancho fijo — cada dato ocupa posiciones exactas en la línea
// Usamos '+000' como ancla para ubicar el monto y la descripción
export function parsearTXTBancoChile(
  textoTXT: string,
  userId: string
): TransaccionParaGuardar[] {
  const lineas = textoTXT
    .split('\n')
    .map(l => l.trimEnd())     // quitar espacios y \r al final
    .filter(l => l.length >= 100); // líneas válidas tienen ~121 chars

  if (lineas.length === 0) {
    throw new Error('El archivo no contiene transacciones válidas.');
  }

  const transacciones: TransaccionParaGuardar[] = [];

  for (const linea of lineas) {
    // '+000' es el ancla del formato — siempre aparece entre el monto y la descripción
    const idx = linea.indexOf('+000');
    if (idx === -1) continue;

    // Monto: 14 dígitos justo antes de '+000', sin ceros a la izquierda
    const montoRaw = linea.slice(idx - 14, idx).replace(/^0+/, '');
    const monto = parseInt(montoRaw, 10);
    if (isNaN(monto) || monto === 0) continue;

    // Descripción y tipo: todo después de '+000', quitando los últimos 13 chars (fecha de proceso)
    const bloqueDesc = linea.slice(idx + 4, -13);
    const tipo = bloqueDesc.trimEnd().slice(-1); // último char del bloque: 'A' o 'C'
    const descripcion = bloqueDesc.trimEnd().slice(0, -1).trim();

    // Ignorar líneas de saldo y retenciones — no son transacciones reales
    if (LINEAS_A_IGNORAR.some(ignorar => descripcion.includes(ignorar))) continue;
    if (tipo !== 'A' && tipo !== 'C') continue;

    // Fecha de operación: posiciones 11–19 en la línea (formato YYYYMMDD)
    const fecha = convertirFecha(linea.slice(11, 19));

    transacciones.push({
      user_id: userId,
      category_id: null,  // sin categoría por ahora — se asigna en V2 con IA
      amount: monto,
      note: descripcion,
      date: fecha,
      type: tipo === 'A' ? 'income' : 'expense',
      source: 'csv',
    });
  }

  return transacciones;
}
