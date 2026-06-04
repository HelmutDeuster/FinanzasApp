# FinanzasApp — Chile

App de finanzas personales para web y móvil. Proyecto de portafolio.
Usuario en Chile, banco: Banco de Chile.
Integración bancaria vía open-banking-chile (scraper local, gratis).
Versión comercial futura vía Fintoc (V3).

---

## Stack

| Tecnología | Rol | Fase |
|---|---|---|
| React Native + Expo SDK 56 | Frontend iOS, Android y web desde un solo código | MVP |
| TypeScript (modo estricto) | Tipado en todo el proyecto | MVP |
| Supabase (local con Docker) | Base de datos PostgreSQL + auth | MVP |
| expo-document-picker | Selector de archivos nativo | MVP |
| Victory Native | Gráficas (donut, barras, líneas) | MVP |
| open-banking-chile | Scraper cuenta corriente + tarjetas de crédito | MVP |
| Express (puerto 3001) | Servidor local — puente entre la app y el scraper | MVP |
| Claude Code (claude-opus-4-7) | Agente en terminal para codificación | MVP |
| GitHub + Git | Control de versiones y portafolio público | MVP |
| Claude API | Categorización automática con IA | V3 |
| Fintoc | Open banking regulado — versión comercial | V3 |
| Expo EAS | Build y publicación en App Store / Play Store | V3 |

---

## Convenciones de código

- **TypeScript estricto** — no usar `any`, no ignorar errores de tipos
- **Comentarios en español** — siempre
- **Componentes en PascalCase** — `HomeScreen`, `CSVImporter`, `SyncButton`
- **Custom hooks con prefijo `use`** — `useTransactions`, `useAuth`
- **Commits en español** — descripción clara de lo que se hizo
- **`npx expo install`** para nuevas dependencias (no `npm install`) — garantiza compatibilidad con Expo SDK 56
- **`--legacy-peer-deps`** si hay conflictos de pares entre React 19 y otras librerías

---

## Estructura del proyecto

```
~/proyectos/FinanzasApp/
├── dev/                          ← código de la app (va a GitHub)
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login.tsx         ← pantalla login/registro ✓
│   │   ├── (tabs)/
│   │   │   └── home.tsx          ← pantalla principal ✓
│   │   ├── _layout.tsx           ← portero de navegación ✓
│   │   └── index.tsx             ← punto de entrada ✓
│   ├── components/
│   │   ├── CSVImporter.tsx       ← importador TXT del banco ✓
│   │   └── SyncButton.tsx        ← botón sincronización open-banking ✓
│   ├── hooks/
│   │   └── useTransactions.ts    ← custom hook transacciones ✓
│   ├── lib/
│   │   ├── supabase.ts           ← cliente Supabase ✓
│   │   ├── csvParser.ts          ← parser TXT Banco de Chile ✓
│   │   ├── importService.ts      ← guardado en Supabase ✓
│   │   └── syncService.ts        ← cliente del servidor Express ✓
│   ├── server/
│   │   ├── syncServer.ts         ← servidor Express (puerto 3001) ✓
│   │   └── bchileSync.ts         ← lógica open-banking-chile ✓
│   ├── types/
│   │   └── index.ts              ← tipos globales TypeScript ✓
│   ├── supabase/                 ← configuración Supabase local ✓
│   ├── CLAUDE.md                 ← este archivo ✓
│   └── .env.local                ← credenciales (NO va a GitHub) ✓
└── docs/
    ├── FinanzasApp_Plan_Maestro.md
    ├── FinanzasApp_UXUI.md
    ├── manual_desarrollo.md
    └── credenciales.txt          ← claves Supabase local
```

---

## Base de datos (Supabase local)

### Tablas

```sql
-- Categorías de gastos e ingresos
categories: id, name, icon, color, type ('income' | 'expense')

-- Transacciones del usuario
transactions: id, user_id, category_id, amount, note, date, type,
              source ('manual' | 'txt' | 'open-banking')

-- Presupuestos mensuales
budgets: id, user_id, category_id, amount, month

-- Metas de ahorro
goals: id, user_id, name, target_amount, current_amount, deadline
```

### RLS activado en
`transactions`, `budgets`, `goals` — cada usuario solo ve sus propios datos.

### Categorías iniciales
Supermercado, Transporte, Restaurantes, Salud, Entretenimiento, Servicios, Sueldo, Otros ingresos.

### Campo `source` en transactions

| Valor | Cuándo se usa |
|---|---|
| `'manual'` | Ingreso manual por el usuario |
| `'txt'` | Importado desde el archivo TXT del banco |
| `'open-banking'` | Sincronizado con open-banking-chile |

### Credenciales locales

| Campo | Valor |
|---|---|
| Project URL | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| Base de datos | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

---

## Variables de entorno (.env.local)

```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<clave anon de supabase local>
BANCOCHILE_RUT=<rut sin puntos con guion>
BANCOCHILE_PASS=<clave de acceso Banco de Chile>
```

> **.env.local está en .gitignore — NUNCA debe subir a GitHub.**

---

## Servidor de sincronización (desde Sesión 04)

El servidor Express corre en `http://127.0.0.1:3001` y actúa de puente entre la app React Native y el scraper open-banking-chile, que no puede correr directamente en el navegador.

```bash
# Iniciar el servidor (Terminal 2)
cd ~/proyectos/FinanzasApp/dev
npx ts-node server/syncServer.ts
```

El endpoint principal es `POST /sync` — la app llama a este endpoint cuando el usuario presiona el botón de sincronización.

---

## Seguridad — reglas absolutas

- **NUNCA** loguear ni imprimir `BANCOCHILE_RUT` o `BANCOCHILE_PASS`
- **NUNCA** incluir credenciales en commits
- **NUNCA** enviar credenciales a Supabase, logs, o servicios externos
- El servidor local solo escucha en `127.0.0.1` — nunca en `0.0.0.0`
- Errores de autenticación → mensaje genérico al usuario, sin detalles internos
- Verificar `.gitignore` antes de cada commit si se modificaron archivos sensibles

---

## Ritual de inicio — hacer SIEMPRE antes de trabajar

```bash
# 1. Abrir Docker Desktop — esperar que el ícono quede estático

# Terminal 1 — app principal
cd ~/proyectos/FinanzasApp/dev
supabase start
npx expo start --web
git status

# Terminal 2 — servidor de sincronización
cd ~/proyectos/FinanzasApp/dev
npx ts-node server/syncServer.ts
```

## Ritual de cierre — hacer SIEMPRE al terminar

```bash
# En ambas terminales:
Ctrl+C

# Luego en Terminal 1:
supabase stop
git add .
git commit -m "descripción de lo que se hizo"
git push
```

---

## Claude Code — configuración recomendada

```bash
# Modelo recomendado para codificación agéntica
claude --model claude-opus-4-7

# O configurar como default global
claude config set model claude-opus-4-7
```

---

## Estado actual del MVP

| Sesión | Fecha | Estado |
|---|---|---|
| Sesión 01 | 25 Mayo 2026 | Setup completo: Expo, Supabase local, auth, GitHub ✓ |
| Sesión 02 | 1 Junio 2026 | Importador TXT: parser, duplicados, 51 transacciones importadas ✓ |
| Sesión 03 | 3 Junio 2026 | Pantalla Home: balance, lista transacciones, donut chart, selector mes ✓ |
| Sesión 04 | 3 Junio 2026 | Sincronización: servidor Express + open-banking-chile + SyncButton ✓ |

### Pendiente para completar MVP
- [ ] Categorización de transacciones (V2 — asignar category_id desde la UI)
- [ ] Presupuestos y metas (V2)
- [ ] Preparación para App Store / Play Store (V3)

---

## Notas técnicas importantes

- El **donut chart aparece gris** en MVP porque las transacciones importadas desde TXT no tienen `category_id`. Se resuelve en V2 con categorización manual o automática.
- **Detección de duplicados en TXT** usa clave compuesta `(date, amount, note)` porque el banco no incluye ID único por transacción.
- **Fintoc fue descartado para uso personal** — costo mínimo ~$250.000 CLP/mes en producción. Se mantiene en roadmap para V3 (versión comercial con clientes pagantes).
- **`npx expo install`** (no `npm install`) para cualquier nueva dependencia — garantiza compatibilidad con Expo SDK 56.

---

*Última actualización: Sesión 04 · 3 de Junio 2026*
