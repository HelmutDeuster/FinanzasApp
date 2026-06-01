// Parser de cartola CSV del Banco de Chile
// El formato del banco es: Fecha;Descripción;Cargo;Abono;Saldo
// Separador: punto y coma (;)
// Números: sin puntos de miles, sin símbolo $

import { CSVRow, TransaccionParaGuardar } from '../types';

// Convierte una fecha en formato "DD/MM/YYYY" al formato ISO "YYYY-MM-DD"
// Supabase espera fechas en formato ISO para ordenarlas correctamente
function convertirFecha(fechaBanco: string): string {
  const [dia, mes, anio] = fechaBanco.split('/');
  return `${anio}-${mes}-${dia}`;
}

// Convierte un string de número del banco a número real
// El banco usa "25990" → 25990 (sin puntos, sin comas, sin símbolo)
// Si la celda está vacía (caso de abono cuando hay cargo), devuelve null
function convertirMonto(monto: string): number | null {
  const limpio = monto.trim();
  if (!limpio) return null;
  // Eliminamos puntos de miles por si acaso (algunos extractos los incluyen)
  const numero = parseFloat(limpio.replace(/\./g, '').replace(',', '.'));
  return isNaN(numero) ? null : numero;
}

// Función principal: recibe el texto completo del CSV y devuelve filas parseadas
// Separamos el parsing del CSV (esta función) de guardar en Supabase (importService)
// para poder testear el parser de forma independiente
export function parsearCSVBancoChile(textoCSV: string): CSVRow[] {
  const lineas = textoCSV
    .split('\n')                  // separar por líneas
    .map(l => l.trim())           // quitar espacios y \r (Windows usa \r\n)
    .filter(l => l.length > 0);  // eliminar líneas vacías

  if (lineas.length === 0) {
    throw new Error('El archivo CSV está vacío');
  }

  // Detectar si la primera línea es el encabezado
  // La cabecera contiene "Fecha" o "fecha" — si no, asumimos que no hay header
  const primeraLinea = lineas[0].toLowerCase();
  const tieneHeader = primeraLinea.includes('fecha') || primeraLinea.includes('descripci');
  const lineasDatos = tieneHeader ? lineas.slice(1) : lineas;

  if (lineasDatos.length === 0) {
    throw new Error('El CSV solo tiene encabezado, sin transacciones');
  }

  const filas: CSVRow[] = [];

  for (const linea of lineasDatos) {
    // Separar por punto y coma — el delimitador del Banco de Chile
    const columnas = linea.split(';');

    // El CSV tiene 5 columnas: Fecha, Descripción, Cargo, Abono, Saldo
    if (columnas.length < 5) {
      // Línea malformada — la saltamos silenciosamente
      // (puede ser un subtotal o línea de resumen al final del archivo)
      continue;
    }

    const [fecha, descripcion, cargoStr, abonoStr, saldoStr] = columnas;

    const cargo = convertirMonto(cargoStr);
    const abono = convertirMonto(abonoStr);
    const saldo = convertirMonto(saldoStr);

    // Si no hay ni cargo ni abono, la línea no tiene monto — ignorar
    if (cargo === null && abono === null) continue;
    // Si no pudimos parsear el saldo, algo está mal con la línea
    if (saldo === null) continue;

    filas.push({
      fecha: fecha.trim(),
      descripcion: descripcion.trim(),
      cargo,
      abono,
      saldo,
    });
  }

  return filas;
}

// Convierte filas CSV al formato que espera Supabase
// Recibe el userId del usuario autenticado para asociar las transacciones
export function csvRowsATransacciones(
  filas: CSVRow[],
  userId: string
): TransaccionParaGuardar[] {
  const transacciones: TransaccionParaGuardar[] = [];

  for (const fila of filas) {
    if (fila.cargo !== null && fila.cargo > 0) {
      // Es un gasto (cargo)
      transacciones.push({
        user_id: userId,
        category_id: null,         // sin categoría por ahora
        amount: fila.cargo,
        note: fila.descripcion,
        date: convertirFecha(fila.fecha),
        type: 'expense',
        source: 'csv',
      });
    } else if (fila.abono !== null && fila.abono > 0) {
      // Es un ingreso (abono)
      transacciones.push({
        user_id: userId,
        category_id: null,
        amount: fila.abono,
        note: fila.descripcion,
        date: convertirFecha(fila.fecha),
        type: 'income',
        source: 'csv',
      });
    }
  }

  return transacciones;
}
