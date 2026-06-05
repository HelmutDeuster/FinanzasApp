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

// Origen del movimiento según open-banking-chile
// Permite distinguir cuenta corriente de tarjetas en Modo Tarjeta del Home
export type BankSource = 'account' | 'credit_card_unbilled' | 'credit_card_billed';

// Propietario de un gasto: solo mío, compartido o 100% de otro
export type SplitOwner = 'me' | 'split' | 'other';

// Cómo se calcula la parte de cada uno en un split
export type SplitModo = 'porcentaje' | 'monto';

// Una transacción lista para guardar en Supabase
// Mapea a la tabla `transactions` que creamos en Sesión 01
export interface TransaccionParaGuardar {
  user_id: string;
  category_id: string | null;
  amount: number;                               // siempre positivo
  note: string;
  date: string;                                 // formato ISO: "2025-04-15"
  type: 'income' | 'expense';
  source: 'manual' | 'csv' | 'txt' | 'open-banking';
  bank_source?: BankSource | null;              // null para TXT; seteado por open-banking
  owner?: SplitOwner;                           // para splits; null = 'me'
  split_amount?: number | null;
  split_person?: string | null;
  // Campos nuevos — poblados por open-banking-chile (migración 003)
  installments?: string | null;                 // "02/06" — cuota 2 de 6; null = pago único
  card_last_four?: string | null;               // "5786" — reservado para cuando la lib lo exponga
  balance_after?: number | null;                // saldo CC después del movimiento
}

// ─── Tarjetas de crédito ──────────────────────────────────────────────────────

export interface CreditCard {
  id: string;
  user_id: string;
  name: string;                                 // "Visa Infinite"
  last_four: string | null;                     // "5786"
  cycle_close_day: number;                      // 1–31 — configurable en Ajustes
  cycle_due_day: number;                        // 1–31 — configurable en Ajustes
  active: boolean;
  source: 'open-banking' | 'manual';
  created_at: string;
  // Cupos — actualizados en cada sync con open-banking (migración 003)
  used_clp: number | null;
  available_clp: number | null;
  total_clp: number | null;
  used_usd: number | null;
  available_usd: number | null;
  total_usd: number | null;
  next_billing_date: string | null;             // "22 de junio"
  billing_period: string | null;                // "Mayo 2026"
  last_synced_at: string | null;
}

// Datos de una tarjeta tal como los devuelve el servidor tras el scrape.
// Se diferencia de CreditCard en que no tiene id ni días de ciclo
// (esos los gestiona el usuario en Ajustes).
export interface CreditCardSyncData {
  label: string;                                // "Visa Infinite ****5786"
  last_four: string;                            // "5786" — extraído del label
  used_clp: number;
  available_clp: number;
  total_clp: number;
  used_usd: number | null;
  available_usd: number | null;
  total_usd: number | null;
  next_billing_date: string | null;
  billing_period: string | null;
}

// ─── Configuración del usuario ────────────────────────────────────────────────

export interface UserSettings {
  user_id: string;
  default_close_day: number;                    // fallback si no hay tarjeta
  default_due_day: number;
  estimated_salary: number | null;
  payment_rut: string | null;
  payment_bank: string | null;
  payment_account: string | null;
  home_mode: 'credit_card' | 'checking';        // persiste el toggle del Home
}

// ─── Cobros / deudas ─────────────────────────────────────────────────────────

export interface DebtItem {
  id: string;
  transaction_id: string;
  person: string;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  share_token: string;
  confirmed_at: string | null;
  created_at: string;
}

// El resultado que devuelve el importador al terminar
export interface ResultadoImportacion {
  total: number;       // filas encontradas en el CSV
  importadas: number;  // filas nuevas guardadas
  duplicadas: number;  // filas que ya existían (ignoradas)
  errores: number;     // filas que no se pudieron procesar
}
