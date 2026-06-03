// Tipos globales de FinanzasApp
// Estos tipos describen la "forma" de los datos que usamos en toda la app

// Una fila parseada del CSV del Banco de Chile
// El banco exporta: Fecha;Descripción;Cargo;Abono;Saldo
export interface CSVRow {
  fecha: string;         // "15/04/2025"
  descripcion: string;   // "COMPRA SUPERMERCADO LIDER"
  cargo: number | null;  // 25990 (null si no hay cargo)
  abono: number | null;  // 200000 (null si no hay abono)
  saldo: number;         // 1500000
}

// Una transacción lista para guardar en Supabase
// Mapea a la tabla `transactions` que creamos en Sesión 01
export interface TransaccionParaGuardar {
  user_id: string;
  category_id: string | null; // null por ahora, lo asignaremos en V2 con IA
  amount: number;             // siempre positivo
  note: string;               // descripción del banco
  date: string;               // formato ISO: "2025-04-15"
  type: 'income' | 'expense'; // abono = income, cargo = expense
  source: 'manual' | 'csv' | 'txt' | 'open-banking';
}

// El resultado que devuelve el importador al terminar
export interface ResultadoImportacion {
  total: number;       // filas encontradas en el CSV
  importadas: number;  // filas nuevas guardadas
  duplicadas: number;  // filas que ya existían (ignoradas)
  errores: number;     // filas que no se pudieron procesar
}
