# Estrategia de pruebas — Ofertas Reales IA

Enfoque dual y seguro: las pruebas **nunca** tocan el bot real ni credenciales
reales; usan fixtures y mocks deterministas (R29.4). La lógica crítica vive en
`lib/` como funciones puras, lo que la hace verificable por ejemplos y por
propiedades.

## Stack y comandos

| Capa | Herramienta |
|------|-------------|
| Unitarias e integración | **Vitest** |
| Pruebas basadas en propiedades (PBT) | **fast-check** |
| End-to-end | **Playwright** |
| Accesibilidad | **@axe-core/playwright** (e2e) y **axe-core** (unitaria con jsdom) |

```bash
npm run typecheck   # tsc --noEmit  (TypeScript estricto: strict + noImplicitAny, sin any)
npm test            # vitest run    (suites unit/ e integration/)
npm run test:watch  # vitest        (modo interactivo)
npm run e2e         # playwright test (suite tests/e2e/)
```

`vitest.config.ts` incluye `tests/unit/**` y `tests/integration/**`; los e2e
viven en `tests/e2e/` y se ejecutan solo con Playwright. La cobertura (v8) se
mide sobre `lib/**`.

> **Quirk de salida en Windows.** El teardown de Vitest puede devolver **código
> de salida 1 aunque todas las pruebas pasen**. El conteo de pruebas que pasan
> (el resumen "passed") es la fuente autoritativa del resultado; no interpretes
> ese código de salida como fallo si el resumen indica que todo pasó.

## La pirámide

### 1. Pruebas unitarias (R29.1)

Cubren la lógica pura de `lib/` con ejemplos concretos, casos límite y
condiciones de error. Suites en `tests/unit/`, entre ellas:

- **Dinero / ahorro:** `money.test.ts` (aritmética decimal con `decimal.js`).
- **Parser:** `parse.test.ts`, `normalize.test.ts`, `category.test.ts`.
- **Enlaces / identificadores:** `identify.test.ts` (ASIN / MLM), `slug.test.ts`.
- **SSRF / dominios:** `ssrf-validate.test.ts`, `ssrf-resolve.test.ts`,
  `ssrf-identify.test.ts`.
- **Webhook / seguridad:** `webhook-secret.test.ts`, `telegram-schema.test.ts`,
  `telegram-files.test.ts`, `telegram-images.test.ts`, `register-webhook.test.ts`.
- **Dedup / fingerprint:** `fingerprint.test.ts`, `dedup.test.ts`.
- **Presentación / app:** `filters.test.ts`, `offers-query.test.ts`,
  `price-visibility.test.ts`, `premium-effects.test.ts`, `realtime-reducer.test.ts`,
  `click.test.ts`, `cron.test.ts`, `env.test.ts`, `supabase-clients.test.ts`,
  `test-message.test.ts`, `time.test.ts`, `admin-allowlist.test.ts`,
  `motion.test.ts`, `magnet.test.ts`.
- **Accesibilidad (unitaria):** `a11y.axe.test.tsx` (axe-core sobre jsdom).

Las unitarias y las propiedades son **complementarias**, no se duplican: las
unitarias fijan ejemplos y bordes; las propiedades cubren la amplitud del espacio
de entradas.

### 2. Pruebas basadas en propiedades (PBT) (R29.1)

Cada propiedad de correctitud del diseño se implementa con **una sola** prueba de
propiedad usando `fast-check`, con **mínimo 100 iteraciones** (`numRuns`; algunas
usan más, p. ej. 200). Cada prueba se etiqueta con un comentario que referencia
la propiedad, en el formato:

```
Feature: ofertas-reales-ia, Property {N}: {texto de la propiedad}
Validates: Requirements {X.Y}
```

Hay **24 propiedades**. Los generadores son a medida (precios `Decimal` exactos a
centavos, mensajes de Telegram con variaciones de formato/emojis/saltos, URLs de
Amazon/ML válidas e inválidas, arreglos `photo[]`, identidades de producto,
combinaciones de señales de dispositivo para la compuerta, estados de filtros y
listas de `ADMIN_EMAIL`).

| # | Propiedad | Archivo | Valida |
|---|-----------|---------|--------|
| 1 | Normalización idempotente | `normalize.property.test.ts` | R4.1, R4.2 |
| 2 | Cálculo de descuento decimal y ofertas sin precio original | `parse.property.test.ts` | R4.7, R4.12 |
| 3 | Tolerancia de descuento de ±1 punto y marca de revisión | `parse.property.test.ts` | R4.8, R4.9 |
| 4 | Rechazo de precios inválidos | `parse.property.test.ts` | R4.10, R4.11 |
| 5 | No invención de campos del parser | `parse.property.test.ts` | R4.13 |
| 6 | Clasificación total de categoría con respaldo 'Otros' | `category.property.test.ts` | R4.14 |
| 7 | Extracción round-trip de identificador externo | `identify.property.test.ts` | R5.5, R5.9 |
| 8 | Allowlist de dominios y protección SSRF | `ssrf.property.test.ts` | R5.1–R5.4 |
| 9 | Preservación y verificación del tag de afiliado | `identify.property.test.ts` | R5.6, R5.7, R5.8 |
| 10 | Determinismo del fingerprint | `fingerprint.property.test.ts` | R7.2 |
| 11 | Deduplicación actualiza sin duplicar y emite UPDATE | `dedup.property.test.ts` | R7.1, R7.3, R7.5 |
| 12 | Idempotencia por `update_id` ante reintentos | `webhook-idempotency.property.test.ts` | R1.12, R1.15 |
| 13 | Compuerta de Chat Autorizado | `webhook-chat-gate.property.test.ts` | R1.10, R1.11 |
| 14 | Comparación de secreto en tiempo constante equivale a igualdad | `webhook-secret.property.test.ts` | R1.3, R1.4 |
| 15 | Ausencia de secretos en logs y mensajes | `webhook-redaction.property.test.ts` | R1.16, R27.5 |
| 16 | Estabilidad y formato del slug | `slug.property.test.ts` | R6.4, R7.6 |
| 17 | Redirección cerrada del Servicio de Clics | `click-redirect.property.test.ts` | R11.4, R11.5, R11.6 |
| 18 | Cálculo de ahorro absoluto | `money.property.test.ts` | R14.1 |
| 19 | Compuerta de efectos premium | `premium-effects.property.test.ts` | R14.4, R14.5 |
| 20 | Datos estructurados honestos | `jsonld.property.test.ts` | R20.4, R20.5, R20.6 |
| 21 | Selección y validación de imagen | `telegram-images.property.test.ts` | R3.1, R3.3, R3.4 |
| 22 | Resolución de administrador por allowlist | `admin-allowlist.property.test.ts` | R10.6 |
| 23 | Estado de filtros sincronizado con la URL (round-trip) | `filters.property.test.ts` | R16.3, R16.4 |
| 24 | Ocultación de precios de Amazon según conmutador | `price-visibility.property.test.ts` | R22.2 |

### 3. Pruebas de integración (R29.2)

En `tests/integration/`:

- **`webhook.test.ts`** — recorre el route handler `POST` real por todas las
  guardas y el pipeline de ingesta (parser + SSRF + dedup + imagen +
  persistencia) con **Supabase y Telegram mockeados**: persistencia en memoria y
  un puerto de imagen de prueba; sin bot, red, base de datos ni secretos reales.
  `@/lib/env.server` y las dependencias del webhook se mockean para usar un
  secreto falso. **Esta suite corre siempre** con `npm test`.
- **`rls.test.ts`** — aplica todas las migraciones a un Postgres real y verifica
  las políticas RLS (anon ve solo `active`; anon no escribe ni lee tablas
  privadas; admin ve todo).
- **`db-constraints.test.ts`** — verifica restricciones del esquema (CHECK de
  precios/estado, unicidad de slug y de `message_id`, `active` exige
  `affiliate_url`).
- **`offers-api.test.ts`** — verifica la consulta pública de ofertas / paginación
  por keyset sin huecos ni duplicados.

#### La compuerta de base de datos (skip-guard)

Las tres suites con base de datos (`rls`, `db-constraints`, `offers-api`) están
envueltas en `describe.skipIf(!process.env.TEST_DATABASE_URL)`: se **omiten** a
menos que se defina `TEST_DATABASE_URL`. Así, el `npm test` por defecto se
mantiene verde donde no hay base de datos, y las pruebas de DB se ejecutan solo
cuando se apunta a una base **desechable**:

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15
# PowerShell
$env:TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres"
# bash / zsh
export TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres"
npm test
```

Usa una conexión de superusuario/owner (la suite de RLS necesita `set role`).
Las filas sembradas llevan un sufijo por ejecución y se limpian al final, así que
es seguro re-ejecutar contra una base compartida.

### 4. Pruebas end-to-end (Playwright) (R29.3)

En `tests/e2e/`, contra **datos sembrados** y **Realtime mockeado**. Antes de las
pruebas se levantan dos servidores gestionados:

1. Un **mock de Supabase** sin dependencias (REST + auth stub). `NEXT_PUBLIC_
   SUPABASE_URL` apunta ahí, de modo que tanto el SSR como el cliente anónimo del
   navegador comparten un único dataset determinista — sin bot, base de datos ni
   credenciales reales (R29.4).
2. La **app bajo prueba**, construida y arrancada con `SKIP_ENV_VALIDATION=1`,
   `NEXT_PUBLIC_E2E=1` (la costura determinista de Realtime) y envs placeholder
   seguras.

Escenarios cubiertos:

- **`public.spec.ts`** — cargar inicio, filtrar, buscar, abrir detalle,
  compartir, alternar tema y navegar en móvil (viewports de R17.1).
- **`admin.spec.ts`** — iniciar sesión como administrador, editar una oferta y
  expirar una oferta.
- **`realtime.spec.ts`** — recibir una **actualización de Realtime simulada**
  (inyectada por la costura `NEXT_PUBLIC_E2E`) y ver una tarjeta nueva sin
  recargar.

**Accesibilidad (R25):** se complementan con auditorías automatizadas con
`@axe-core/playwright` en página. La verificación completa de WCAG 2.2 AA
requiere además pruebas manuales con tecnología de asistencia y revisión experta.

## Fixtures y mocks (R29.4)

Las pruebas **no dependen del bot real**. En `tests/fixtures/`:

- **`telegram.ts`** — payloads de Update de ejemplo (los 4 tipos) y cliente de
  Telegram simulado (`setWebhook`, `getWebhookInfo`, `getFile`, descarga de
  archivo) sin red real.
- **`offers.ts`** — ofertas de muestra para presentación y consultas.
- **`persistence.ts`** — persistencia en memoria para el pipeline de ingesta.

Nunca se usa la clave de rol de servicio real ni el Token del Bot real en las
pruebas.

## Triaje de contraejemplos (PBT)

Cuando una prueba de propiedad falla, `fast-check` entrega un contraejemplo
minimizado. El triaje decide entre tres caminos:

1. **La prueba es incorrecta** → ajustar la prueba/generador.
2. **El contraejemplo es un bug** → corregir el código.
3. **La especificación es extraña** → los criterios de aceptación podrían faltar
   algo. **Nunca** se cambian los criterios sin consultar; se pide input antes de
   tocar la especificación.
