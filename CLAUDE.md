# FinanzasApp — Chile

App de finanzas personales para web y móvil. Proyecto de portafolio.
Usuario en Chile, banco: Banco de Chile.

## Stack
- React Native + Expo SDK 56 + TypeScript
- Supabase local (Docker) — auth + PostgreSQL
- Victory Native (gráficas)
- expo-document-picker (selector de archivos)

## Estructura de carpetas
/app          → pantallas (Expo Router)
/components   → componentes reutilizables (CSVImporter.tsx ya existe)
/lib          → supabase.ts, csvParser.ts, importService.ts
/hooks        → custom hooks (vacío — próximo paso)
/types        → index.ts con tipos globales

## Base de datos — tablas en Supabase
- categories: id, name, icon, color, type ('income'|'expense')
- transactions: id, user_id, category_id, amount, note, date, type ('income'|'expense'), source ('manual'|'csv'|'fintoc')
- budgets: id, user_id, category_id, amount, month
- goals: id, user_id, name, target_amount, current_amount, deadline

## Estado actual
- Auth completa funcionando (registro, login, logout)
- Importador TXT del Banco de Chile funcionando (CSVImporter.tsx)
- 51 transacciones reales en Supabase
- Pantalla home.tsx existe pero es temporal — hay que reemplazarla

## Convenciones
- TypeScript estricto
- Comentarios en español
- Componentes en PascalCase
- Hooks con prefijo "use"
- Commits en español y descriptivos

## Formato cartola Banco de Chile
El banco exporta TXT de ancho fijo. Parser en lib/csvParser.ts.
Tipo A = Abono (income), C = Cargo (expense).

## Comandos útiles
npx expo start --web   → correr en navegador
supabase start         → arrancar BD local
supabase stop          → detener BD local
npx expo install [pkg] → instalar paquete compatible con Expo SDK 56