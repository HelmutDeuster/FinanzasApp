# FinanzasApp — Diseño UX/UI

> Documento de producto · App de finanzas personales para Chile
> Última actualización: Junio 2026

---

## Filosofía de diseño

**"Calm finance"** — la app no estresa, informa. Los datos hablan, la UI se calla.

Referencias visuales: Revolut, Fintual, Fintoc, Racional. Lo que comparten: jerarquía clara, tipografía fuerte, paleta contenida. Nada decorativo por decorar.

### Principios
- El número más importante siempre visible sin scroll
- Un color = un significado (verde ingreso, rojo gasto, ámbar pendiente, azul informativo)
- Cero ambigüedad: cada pantalla responde una pregunta concreta
- Interacciones mínimas para tareas frecuentes

---

## Sistema de diseño

### Tema visual

**Modo oscuro** — paleta principal:

| Elemento | Color |
|---|---|
| Fondo app | `#0F1117` |
| Cards / secciones | `#181B24` |
| Cards internas | `#0F1117` |
| Bordes | `#2A2D38` |
| Texto principal | `#F1F0EC` |
| Texto secundario | `#6B6A66` |
| Texto terciario / hints | `#4A4D5A` |

**Colores semánticos (sobre fondo oscuro):**

| Uso | Texto | Fondo |
|---|---|---|
| Ingresos / positivo | `#639922` | `#162210` |
| Egresos / negativo | `#E24B4A` | `#2D1515` |
| Ahorro / informativo | `#378ADD` | `#0F1E33` |
| Advertencia | `#EF9F27` | `#2A1E08` |

### Componentes clave
- **Cards de sección**: `#181B24`, borde `0.5px #2A2D38`, radio 12px, padding 16px 18px
- **Cards internas** (tarjetas dentro de sección): `#0F1117`, borde `0.5px #2A2D38`, radio 8px
- **Sin barras de progreso** en cards de tarjeta — solo números y texto
- **Alerts inline**: borde 0.5px semántico + fondo semántico oscuro, radio 8px
- **Botón Sincronizar**: esquina superior derecha, estilo secundario discreto

### Navegación
4 tabs fijos en la parte inferior:

```
Inicio  ·  Proyección  ·  Me deben  ·  Ajustes
```

Badge de monto pendiente en el tab "Me deben" cuando hay cobros activos.

---

## Pantallas

---

### Login / Registro

**Pregunta que responde:** ¿Cómo entro?

**Contenido:**
- Nombre de la app centrado
- Tagline: *"Tus finanzas, ordenadas."*
- Campos: email + contraseña
- Botón primario: Entrar
- Link secundario: ¿No tienes cuenta? Regístrate

**Decisiones de diseño:**
- Sin ilustraciones ni marketing — el primer contacto es limpio
- La tagline refleja el estado emocional objetivo del usuario

---

### Home

**Pregunta que responde:** ¿Cómo está mi balance financiero este mes?

**Tema visual:** Modo oscuro. Fondo `#0F1117`, cards `#181B24`, bordes `#2A2D38`.
Sin barras de progreso en las cards de tarjeta — solo números.

#### Header
- Título: mes actual ("Junio 2026") + subtítulo "Tu balance financiero"
- Botón "Sincronizar" esquina superior derecha — discreto, estilo secundario

#### Toggle persistente
```
[ Tarjeta ]  [ Cuenta ]
```
Se guarda en `user_settings.home_mode` entre sesiones.

---

#### Modo Tarjeta — dos bloques

**BLOQUE 1 — Balance mensual (1 → último día del mes)**

Modelo contable:
```
Ingresos = Ahorro + Egresos
(Sueldo + transfers + abonos) = (Fintual + saldo CC) + (TC del ciclo + gastos CC directos)
```

Elementos:
- Número hero: total ingresos del mes
- Subtítulo: "ingresos del mes"
- Ecuación en tres columnas separadas por `=` y `+`:
  - **Ingresos** (verde): sueldo + transfers — con desglose en texto pequeño
  - **Ahorro** (azul): Fintual + saldo CC — con desglose
  - **Egresos** (rojo): TCs + CC directo — con desglose
- Alert debajo del bloque:
  - Verde `✓`: ahorro > 0 y balance cierra
  - Rojo `⚠`: vas al límite — muestra cuánto queda para ahorrar

**Clasificación de transacciones para el balance:**
- `type = 'income'` o monto positivo → Ingresos
- `bank_source = 'credit_card_*'` → Egresos TC
- Transfers salientes a plataformas conocidas (Fintual, etc.) → Ahorro
- Resto de débitos de cuenta corriente → Egresos CC directo

**BLOQUE 2 — Ciclo tarjetas**

- Subtítulo: "próximo vencimiento [fecha]"
- Número hero: monto del grupo que vence primero
- Subtítulo: "total a pagar en el próximo cierre"
- Lista de cards por tarjeta, ordenadas por vencimiento más próximo:
  - Nombre + últimos 4 dígitos
  - "cierre [fecha] · vence [fecha]"
  - Monto del ciclo (solo número, sin barras)
  - Días restantes — rojo si ≤ 3 días, gris si > 3 días

**Lógica de agrupación del hero del Bloque 2:**
```
1. Agrupar tarjetas por cycle_close_day
2. Hero = suma del grupo que vence más próximo a hoy
3. Si dos tarjetas comparten cycle_close_day → sumar
4. Resto de tarjetas aparecen en la lista con su monto individual
5. Al pasar el cierre, el hero rota automáticamente al siguiente grupo
```

---

#### Modo Cuenta
Mantiene la vista anterior: saldo de cuenta corriente como número principal,
ingresos vs gastos del mes, donut de categorías, últimas transacciones.

---

#### Modo Cuenta Corriente

**Número principal:** Saldo disponible en cuenta corriente

**Elementos en orden:**
1. Toggle Tarjeta / Cuenta
2. Saldo en cuenta — número grande
3. Stats: Ingresos del mes · Gastos del mes
4. Barra de gastos vs ingresos (porcentaje)
5. Donut de gastos por categoría
6. Últimas transacciones

---

#### Cards por tarjeta

Cada tarjeta muestra:
- Nombre + últimos 4 dígitos (ej: `Visa ****8335`)
- Ciclo propio: `cierre día X · vence día Y` — configurable por tarjeta
- Monto gastado en el ciclo de esa tarjeta
- Barra temporal propia: `día inicio ←●→ Hoy ←→ día cierre`
- Barra de progreso de monto relativa al total del ciclo
- Toque → entra al drill-down de esa tarjeta con su ciclo específico

---

### Drill-down por tarjeta

**Pregunta que responde:** ¿Qué cargó esta tarjeta específica?

**Header:** Nombre de tarjeta + rango del ciclo · botón `← Todas las tarjetas`

**Filtros:**
```
[ Todas ]  [ Mías ]  [ De otros ]
```

**Stats:** Tu parte · De otros

**Lista de transacciones:**
- Transacciones normales: descripción + categoría + monto
- Transacciones con split: badge `👥 split · Persona X%` + monto total tachado + tu parte en verde
- Transacciones 100% de otro: monto tachado + etiqueta "excluido"

---

### Detalle de transacción — Marcar como de otro

**Acceso:** Toque sobre cualquier transacción

**Selector de tipo:**
```
[ Solo mío ]  [ Split ]  [ 100% otro ]
```

**Si es Split:**
- Campo: Persona (texto libre)
- Selector: Porcentaje o Monto fijo
- Cálculo instantáneo: Tu parte · [Persona] te debe
- Botón guardar

**Si es 100% otro:**
- Campo: Persona
- Se excluye del total automáticamente
- Se agrega a "Me deben" por el monto completo

**Impacto inmediato en Home:**
- El número principal del Home se actualiza al guardar
- El monto aparece en "Me deben"

---

### Me deben

**Pregunta que responde:** ¿Quién me debe qué y cuánto en total?

**Header:** Total pendiente de cobro (suma de todas las personas)

**Una card por persona** que contiene:
- Nombre + total pendiente + estado (pendiente / parcial / pagado)
- Lista de transacciones incluidas con descripción, fecha, tipo (split X% o 100%)
- Dos acciones: `Cobrar` (share) · `Pagó` (marcar como saldado)

**Al tocar "Pagó":**
- La card se marca como pagada
- El monto sale del total pendiente
- Se registra `paid_at` para historial

---

### Flujo de cobro compartido

**Acceso:** Botón "Cobrar" en la card de una persona

**Sheet de cobro:**
1. Nombre de la persona + total a cobrar
2. Dos botones de compartir:
   - **WhatsApp** → genera mensaje de texto con lista de items + link
   - **Imagen** → genera captura lista para enviar por cualquier app
3. Vista previa del mensaje
4. Datos de pago del usuario (configurados en Ajustes)

**Mensaje de WhatsApp generado:**
```
[Nombre] te está cobrando $69.800
· Cena La Mar — $42.000
· Uber aeropuerto — $18.500
· Copec bencina — $9.300
Ver detalle → finanzasapp.cl/cobro/[token]
```

**Página pública (lo que ve quien debe):**
- URL: `finanzasapp.cl/cobro/[token]` — sin login requerido
- Muestra: nombre del cobrador · total · desglose de transacciones con fecha y % de split
- Datos bancarios del cobrador (RUT + banco)
- Botón "Confirmar pago" → notifica al cobrador (no procesa dinero)
- Funciona como página estática de solo lectura

---

### Proyección

**Pregunta que responde:** ¿Cómo quedo el próximo ciclo?

Esta sección tiene dos sub-vistas: **Proyección** y **Simulador**.

---

#### Sub-vista: Proyección del ciclo

**Las tres preguntas respondidas al tope, siempre visibles:**

| Pregunta | Respuesta |
|---|---|
| ¿Cuánto me sobra para ahorrar? | Monto en verde / rojo |
| ¿Alcanza el sueldo? | ✓ Sí / ⚠ No, faltan $X |
| ¿Cuánto puedo gastar hasta el 23? | Monto disponible antes de comprometer ahorro |

**Waterfall de flujo (debajo de las respuestas):**
```
Sueldo estimado          +$2.100.000  ████████████████
TC del ciclo actual      −$1.000.000  ████████
Fijos proyectados        −$621.380    ██████
─────────────────────────────────────────────
Para ahorrar              $478.620    ████
```

**Barra de avance del ciclo actual:**
- Azul sólido = gastado real
- Azul claro = proyección hasta cierre
- Marcador vertical = hoy

---

#### Sub-vista: Gastos fijos del ciclo

**Acceso:** Botón "Editar fijos" en la proyección

**Auto-detección:**
La app analiza los últimos 3 ciclos e identifica transacciones recurrentes (misma descripción, monto similar, presente en 2 de 3 ciclos). Las presenta con chip `auto` para confirmar.

**Cuotas activas:**
Se detectan automáticamente desde el campo `installments` de open-banking-chile. Se muestran con el número de cuota (`cuota 3/12`).

**Edición:**
- Cada fijo es editable (lápiz) — monto o nombre
- Toggle para incluir/excluir del cálculo
- Botón "Agregar gasto fijo" para ingresos manuales (arriendo, etc.)

**Chip de origen:**
- `auto` púrpura = detectado automáticamente
- `manual` gris = ingresado por el usuario

---

#### Sub-vista: Simulador "¿y si?"

**Tres tabs:**

**Tab Sueldo:**
- Slider de sueldo estimado (rango configurable)
- El resultado se actualiza al instante

**Tab Gasto extra:**
- Campo de texto + botones rápidos: `+$100K` `+$200K` `+$500K`
- Simula el impacto de una compra grande en el ahorro disponible

**Tab Meta ahorro:**
- Slider de meta de ahorro objetivo
- Muestra si alcanza y cuánto sobra o falta

**Resultado dinámico (visible en los tres tabs):**
```
TC proyectada      $1.000.000
Fijos              $621.380
─────────────────────────────
Para ahorrar       $478.620   ← se actualiza en tiempo real
```

**Fórmula:**
```
Para ahorrar = Sueldo estimado − TC del ciclo − Fijos proyectados
```

---

### Ajustes

**Secciones:**

**Cuenta**
- Email del usuario
- Cerrar sesión

**Datos bancarios personales** (para cobros)
- RUT
- Banco
- Tipo de cuenta

**Tarjetas de crédito**
Una sección por cada tarjeta detectada (desde open-banking o ingresada manualmente):
- Nombre editable (ej: "Visa principal", "MC compartida")
- Últimos 4 dígitos (solo lectura si viene de open-banking)
- Día de cierre del ciclo (número del 1 al 31)
- Día de vencimiento del pago (número del 1 al 31)
- Toggle activa / inactiva (para excluir del cálculo sin borrarla)
- Botón "Agregar tarjeta manualmente" para quien no use open-banking

**Ejemplo de configuración:**
```
Visa ****8335        cierre: 23  ·  vence: 6
Mastercard ****4421  cierre: 5   ·  vence: 20
```

**Ciclo de facturación global** (fallback si no hay tarjetas configuradas)
- Día de cierre default: 23
- Día de vencimiento default: 6

**Sueldo estimado**
- Monto base para proyecciones
- Editable en cualquier momento

**Importación de datos**
- Importar cartola TXT (Banco de Chile)
- Sincronizar automático (open-banking-chile)

**Preferencias**
- Moneda: CLP (fijo en MVP)
- Tema: Sistema / Claro / Oscuro

---

## Modelo de datos — campos adicionales para estas features

### Tabla `transactions` (campos nuevos)

```sql
owner        TEXT    -- 'me' | 'split' | 'other'
split_amount NUMERIC -- monto que corresponde al usuario (null si owner = 'me')
split_person TEXT    -- nombre libre de la otra persona
```

### Tabla `debts` (nueva)

```sql
id             UUID PRIMARY KEY
transaction_id UUID REFERENCES transactions(id)
person         TEXT        -- nombre libre
amount         NUMERIC     -- monto que debe esa persona
paid           BOOLEAN DEFAULT false
paid_at        TIMESTAMP
share_token    TEXT UNIQUE -- para URL pública: finanzasapp.cl/cobro/[token]
confirmed_at   TIMESTAMP   -- cuando el deudor confirma que pagó
```

### Tabla `fixed_expenses` (nueva)

```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES auth.users(id)
name        TEXT
amount      NUMERIC
origin      TEXT    -- 'auto' | 'manual'
active      BOOLEAN DEFAULT true
```

### Tabla `credit_cards` (nueva)

```sql
id               UUID PRIMARY KEY
user_id          UUID REFERENCES auth.users(id)
name             TEXT        -- nombre editable: "Visa principal", "MC compartida"
last_four        TEXT        -- últimos 4 dígitos
cycle_close_day  INTEGER     -- día de cierre (1-31)
cycle_due_day    INTEGER     -- día de vencimiento del pago (1-31)
active           BOOLEAN DEFAULT true
source           TEXT        -- 'open-banking' | 'manual'
created_at       TIMESTAMP DEFAULT now()
```

**Nota:** cuando open-banking-chile sincroniza, crea o actualiza el registro de `credit_cards` usando `last_four` como identificador. Si la tarjeta ya existe, solo actualiza transacciones. El usuario puede editar `name`, `cycle_close_day` y `cycle_due_day` libremente.

### Tabla `user_settings` (nueva)

```sql
user_id              UUID REFERENCES auth.users(id) PRIMARY KEY
default_close_day    INTEGER DEFAULT 23   -- fallback si la tarjeta no tiene ciclo propio
default_due_day      INTEGER DEFAULT 6    -- fallback
estimated_salary     NUMERIC
payment_rut          TEXT
payment_bank         TEXT
payment_account      TEXT
home_mode            TEXT DEFAULT 'credit_card'  -- 'credit_card' | 'checking'
```

---

## Roadmap de implementación

### MVP (estado actual + estas features)
- [x] Auth completa
- [x] Importador TXT Banco de Chile
- [x] Sincronización open-banking-chile
- [x] Pantalla Home con balance y donut
- [ ] Toggle Tarjeta / Cuenta en Home
- [ ] Ciclo de facturación con barra temporal
- [ ] Cards por tarjeta con drill-down
- [ ] Split de gastos (marcar como de otro)
- [ ] Tab "Me deben" con cards por persona
- [ ] Cobro compartido por WhatsApp e imagen
- [ ] Página pública de cobro (link)
- [ ] Auto-detección de gastos fijos
- [ ] Proyección del ciclo (waterfall)
- [ ] Simulador "¿y si?"
- [ ] Tabla `credit_cards` con ciclo por tarjeta
- [ ] Tabla `user_settings` con configuración de ciclo

### V2
- [ ] Categorización de transacciones (asignar category_id)
- [ ] Gastos por categoría con barras horizontales
- [ ] Metas de ahorro con seguimiento
- [ ] Presupuesto mensual por categoría
- [ ] Reportes: comparativa mensual, tendencia

### V3
- [ ] Categorización automática con Claude API
- [ ] Fintoc para versión comercial
- [ ] Push notifications
- [ ] App Store / Play Store

---

## Notas de implementación

**Link de cobro público:**
No requiere autenticación. Se genera un token único (`nanoid` o `uuid`) al crear el cobro. La página en `finanzasapp.cl/cobro/[token]` es una ruta pública en Expo Router (`app/cobro/[token].tsx`) que consulta Supabase con el token sin RLS (política pública de solo lectura para esa tabla). El botón "Confirmar pago" llama a una función que registra `confirmed_at` y notifica al usuario.

**Auto-detección de fijos:**
Query sobre las últimas 3 instancias del ciclo. Se agrupa por `note` (descripción) y se filtra por transacciones que aparecen en al menos 2 de 3 ciclos con monto dentro del ±10% de variación. Se presentan al usuario para confirmar antes de incluir en proyección.

**Ciclos por tarjeta — lógica de fecha:**
Para calcular el ciclo activo de una tarjeta dado un día de cierre X:
```typescript
// Si hoy es 10 de junio y la tarjeta cierra el día 23:
// → ciclo activo: 24 may → 23 jun
// Si hoy es 25 de junio y la tarjeta cierra el día 23:
// → ciclo activo: 24 jun → 23 jul

function getCycleRange(closeDay: number): { start: Date; end: Date } {
  const today = new Date();
  const currentDay = today.getDate();
  let cycleEnd: Date;
  if (currentDay <= closeDay) {
    // El cierre es este mes
    cycleEnd = new Date(today.getFullYear(), today.getMonth(), closeDay);
  } else {
    // El cierre es el mes que viene
    cycleEnd = new Date(today.getFullYear(), today.getMonth() + 1, closeDay);
  }
  const cycleStart = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth() - 1, closeDay + 1);
  return { start: cycleStart, end: cycleEnd };
}
```

**Modo por defecto:**
Si el usuario tiene más transacciones de tipo TC que de cuenta corriente, el modo default es Tarjeta. Si no, Cuenta. Se puede cambiar en cualquier momento y se persiste en `user_settings.home_mode`.

---

*Última actualización: Sesión de diseño UX/UI · Junio 2026 — rediseño balance contable + modo oscuro*
*Próxima actualización: al diseñar nuevas features*
