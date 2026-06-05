# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Comandos de desarrollo

### Arranque completo (requiere Docker Desktop corriendo)

```bash
# Terminal 1 — base de datos + app
supabase start          # inicia PostgreSQL local en Docker
npx expo start --web    # app en http://localhost:8081

# Terminal 2 — servidor de sincronización bancaria
npx ts-node server/syncServer.ts
```

### TypeScript

```bash
# Check del app (usa tsconfig.json raíz)
npx tsc --noEmit

# Check del servidor (usa server/tsconfig.json)
npx tsc --noEmit --project server/tsconfig.json
```

Hay 4 errores pre-existentes e inocuos en `app/(tabs)/_layout.tsx` relacionados con `ColorValue` vs `string` en los íconos unicode. No son regresiones.

### Dependencias

Usar siempre `npx expo install <paquete>` (nunca `npm install`) — garantiza compatibilidad con Expo SDK 56. Agregar `--legacy-peer-deps` si hay conflictos de pares con React 19.

### Migraciones de base de datos

Las migraciones **no** se aplican con `supabase migration up` porque el tracker local está desfasado. Aplicar directamente:

```bash
docker cp archivo.sql supabase_db_dev:/tmp/mig.sql
docker exec supabase_db_dev psql -U postgres -d postgres -f /tmp/mig.sql
```

Supabase Studio en `http://127.0.0.1:54323` para inspeccionar datos.

---

## Arquitectura

### Flujo de datos bancarios

```
Banco de Chile
  ↓  (Playwright / Chromium)
server/bchileSync.ts          ← convierte formato del banco al de la app
  ↓  POST /sync (Express 3001)
lib/syncService.ts            ← upsert tarjetas + snapshot + importar transacciones
  ↓
Supabase (PostgreSQL local)
  ↓
hooks/use*.ts                 ← cada pestaña tiene su propio hook
  ↓
app/(tabs)/*.tsx
```

El servidor Express **solo** puede correr localmente (escucha en `127.0.0.1`, nunca `0.0.0.0`). El scraper usa Puppeteer/Chromium — requiere que Docker esté activo y el servidor corriendo en Terminal 2.

### Estructura de navegación (Expo Router)

```
app/_layout.tsx          ← portero: redirige a /(auth)/login o /(tabs)/home según sesión
app/(auth)/login.tsx
app/(tabs)/_layout.tsx   ← barra inferior con 4 tabs
app/(tabs)/home.tsx      ← 3 sub-pestañas: Balance / Cuenta / Tarjetas
app/(tabs)/me-deben.tsx
app/(tabs)/proyeccion.tsx
app/(tabs)/ajustes.tsx
app/tarjeta/[id].tsx     ← detalle de tarjeta (fuera del grupo tabs → no muestra barra)
```

### Home — 3 sub-pestañas (estado local, no persiste)

`app/(tabs)/home.tsx` contiene todo el Home. Cada pestaña es un componente función local con su propio hook:

| Pestaña | Componente | Hook |
|---|---|---|
| Balance | `PestañaBalance` | `useBalanceMensual(año, mes)` |
| Cuenta | `PestañaCuenta` | `useModoCuentaCC(año, mes)` |
| Tarjetas | `PestañaTarjetas` | `useModoTarjeta(defaultCloseDay)` |

El botón Sincronizar usa un `useRef` para llamar a la función `refrescar` del hook activo, sin saber qué pestaña está abierta.

`useUserSettings` se usa únicamente para leer `default_close_day` (fallback de ciclo de tarjetas) — el campo `home_mode` ya no controla la UI.

### bank_source — valores críticos

Las transacciones usan `bank_source` para distinguir su origen. El CHECK constraint de la BD solo permite:

```
'account'              → débito de cuenta corriente (open-banking)
'credit_card_unbilled' → gasto TC no facturado (ciclo abierto)
'credit_card_billed'   → gasto TC facturado
NULL                   → importado desde TXT del banco (origen desconocido)
```

**Importante:** el valor es `'account'`, no `'checking'`. La pestaña Cuenta filtra estrictamente por `bank_source = 'account'` — las transacciones NULL (TXT) se excluyen porque pueden incluir gastos de TC que no podemos identificar.

### card_last_four — limitación del scraper

El campo `card_last_four` en `transactions` es `NULL` en todos los registros actuales porque `open-banking-chile v2.1.2` no expone a qué tarjeta pertenece cada movimiento individual. `useModoTarjeta` tiene lógica dual:
- Si alguna transacción tiene `card_last_four != null` → filtrado exacto por tarjeta
- Si todos son NULL (situación actual) → distribución proporcional usando `credit_cards.used_clp` como peso

### Ciclos de tarjetas

`lib/cycleUtils.ts` → `getCycleRange(closeDay, offset?)`:
- Si `hoy <= closeDay` → el cierre es **este mes**
- Si `hoy > closeDay` → el cierre es **el mes siguiente**
- El inicio siempre es `closeDay + 1` del mes anterior al cierre

`next_billing_date` en `credit_cards` se guarda en formato ISO (`2026-06-22`) desde `lib/syncService.ts → parsearNextBillingDate()`. En el Home, si está disponible, se usa directamente para calcular días restantes en vez de `getCycleRange`.

### Deduplicación de transacciones

Clave: `"fecha|monto|tipo|nota|cuotas"` (ver `lib/importService.ts`). Las cuotas (`installments`) se incluyeron en la clave después de la migración 003, que hizo backfill extrayendo `[cuota 02/06]` de las notas.

### Gráfico de barras

`components/GraficoBarrasMes.tsx` usa **react-native-svg** (no Victory Native). Victory Native está instalado pero no se usa en este componente porque `@shopify/react-native-skia` falla en el navegador al intentar inicializar `XYWHRect`. El componente funciona igual en web y en nativo sin condicionales de plataforma.

### Dos tsconfig separados

- `tsconfig.json` (raíz): compila la app Expo + hooks + components + lib
- `server/tsconfig.json`: compila solo el servidor Express; excluye explícitamente `app/`, `components/`, `hooks/`, `lib/`

---

## Esquema de base de datos actual

```sql
transactions:
  id, user_id, category_id, amount, note, date, type, source,
  bank_source, owner, split_amount, split_person,  -- migración 001
  installments, card_last_four, balance_after       -- migración 003

credit_cards:
  id, user_id, name, last_four, cycle_close_day, cycle_due_day,
  active, source, created_at,
  used_clp, available_clp, total_clp,               -- migración 003
  used_usd, available_usd, total_usd,
  next_billing_date, billing_period, last_synced_at

account_snapshots:
  id, user_id, balance, synced_at                   -- migración 003

user_settings:
  user_id, default_close_day, default_due_day,
  estimated_salary, payment_rut, payment_bank,
  payment_account, home_mode

debts:         -- para la pestaña "Me deben"
fixed_expenses:-- para proyección (gastos fijos recurrentes)
categories:    -- sin UI de gestión todavía
```

RLS activo en todas las tablas excepto `categories`.

---

## Convenciones del proyecto

- TypeScript estricto — `any` está prohibido salvo en interfaces que Victory Native exige (index signature `[key: string]: unknown` en `GastoMes`)
- Comentarios en español
- Commits en español
- Componentes en PascalCase, hooks con prefijo `use`
- Formato de montos: `fmt(n)` para montos largos, `fmtAbr(n)` (K/M) para espacios reducidos como el desglose de egresos

---

## Seguridad

`BANCOCHILE_RUT` y `BANCOCHILE_PASS` viven en `.env.local` (en `.gitignore`). Nunca loguear estas variables ni incluirlas en respuestas al cliente. El servidor devuelve mensajes genéricos en errores de autenticación.
