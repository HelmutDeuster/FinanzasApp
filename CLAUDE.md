# FinanzasApp — Chile

App de finanzas personales para web y móvil. Proyecto de portafolio.
Usuario en Chile, banco: Banco de Chile.
Integración bancaria vía open-banking-chile (scraper local, gratis).

## Stack
- React Native + Expo SDK 56 + TypeScript
- Supabase local (Docker) — auth + PostgreSQL
- Victory Native (gráficas)
- expo-document-picker (selector de archivos)
- open-banking-chile (scraper local) — cuenta corriente + tarjetas de crédito
- Express (servidor local puerto 3001) — puente entre la app y el scraper

## Estructura de carpetas
/app          → pantallas (Expo Router)
/components   → CSVImporter.tsx, SyncButton.tsx
/lib          → supabase.ts, csvParser.ts, importService.ts, syncService.ts
/hooks        → useTransactions.ts
/types        → index.ts con tipos globales
/server       → syncServer.ts, bchileSync.ts (servidor local Node.js)

## Base de datos — tablas en Supabase
- categories: id, name, icon, color, type ('income'|'expense')
- transactions: id, user_id, category_id, amount, note, date, type
  ('income'|'expense'), source ('manual'|'txt'|'open-banking')
- budgets: id, user_id, category_id, amount, month
- goals: id, user_id, name, target_amount, current_amount, deadline

## Estado actual (Sesión 04 completada)
- Auth completa funcionando (registro, login, logout)
- Importador TXT del Banco de Chile funcionando (CSVImporter.tsx)
- 51 transacciones reales en Supabase
- Pantalla Home completa: balance del mes, lista de transacciones,
  donut chart, selector de mes ← →
- Sincronización automática implementada:
  - server/bchileSync.ts — adaptador para open-banking-chile v2.1.2
  - server/syncServer.ts — Express en 127.0.0.1:3001
  - lib/syncService.ts — cliente desde la app
  - components/SyncButton.tsx — botón con 4 estados
- Próximo paso: agregar SyncButton a la pantalla Home y probar sincronización real

## Integración open-banking-chile
El scraper corre localmente en el Mac del usuario con Chrome.
Soporta para bchile:
- checking → cuenta corriente/vista
- credit_card_unbilled → tarjeta de crédito por facturar
- credit_card_billed → tarjeta de crédito facturada
- Incluye cuotas (campo installments: "02/06" = cuota 2 de 6)

Credenciales en .env.local (NUNCA en el código):
  BANCOCHILE_RUT=12345678-9
  BANCOCHILE_PASS=tu_clave

El servidor local (server/syncServer.ts) expone POST /sync en puerto 3001.
La app llama a este endpoint vía lib/syncService.ts.

## Seguridad — reglas estrictas
- NUNCA imprimir, loguear ni exponer BANCOCHILE_RUT o BANCOCHILE_PASS
- NUNCA incluir credenciales en commits (.env.local está en .gitignore)
- NUNCA enviar credenciales fuera del servidor local
- Si hay error de autenticación, mostrar mensaje genérico al usuario
- El servidor solo escucha en 127.0.0.1, nunca en 0.0.0.0
- Verificar .gitignore antes de hacer commit

## Mejoras al scraper — detectar y proponer siempre
Si al trabajar con open-banking-chile detectas:
- Campos del JSON no usados pero útiles (cuotas, saldo, máscara tarjeta)
- Errores o comportamientos que podrían manejarse mejor
- Patrones de datos que permitan mejor categorización automática
- Oportunidades para hacer el scraping más robusto
→ Proponer la mejora con justificación antes de implementarla

## Convenciones
- TypeScript estricto — nunca usar 'any'
- Comentarios en español
- Componentes en PascalCase
- Hooks con prefijo "use"
- Commits en español y descriptivos

## Formato cartola Banco de Chile (TXT)
Ancho fijo posicional. Parser en lib/csvParser.ts.
Tipo A = Abono (income), C = Cargo (expense).
Mantener compatibilidad — el importador TXT coexiste con open-banking.

## Comandos útiles
npx expo start --web              → correr app en navegador
supabase start                    → arrancar BD local
supabase stop                     → detener BD local
npx expo install [pkg]            → instalar paquete compatible con Expo SDK 56
npx ts-node server/syncServer.ts  → arrancar servidor de sincronización

## API de open-banking-chile (v2.1.2)
El scraper expone un objeto `bchile` con método `scrape(options: ScraperOptions)`.
- `options.rut`: RUT con o sin formato ("12345678-9" o "123456789")
- `options.password`: clave de internet
- `options.onProgress`: callback (paso: string) para logging
- Resultado `ScrapeResult.movements`: array de `BankMovement`
  - `date`: "dd-mm-yyyy" (convertir a ISO para Supabase)
  - `amount`: positivo = abono, negativo = cargo
  - `source`: "account" | "credit_card_unbilled" | "credit_card_billed"
  - `installments`: "02/06" o undefined — codificar en la nota "[cuota 2/6]"
  - `balance`: saldo post-transacción (no se guarda en BD por ahora)
- Si `ScrapeResult.success === false`, revisar `error` para detectar AUTH_ERROR
- Si el banco pide 2FA, el scraper lee de stdin (la terminal del servidor)