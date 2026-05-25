// lib/supabase.ts
// Cliente de Supabase — punto de conexión central con la base de datos

import { createClient } from '@supabase/supabase-js';

// Las variables con prefijo EXPO_PUBLIC_ son accesibles desde el cliente
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Exportamos el cliente para usarlo en toda la app
export const supabase = createClient(supabaseUrl, supabaseAnonKey);