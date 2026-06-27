# Arquitectura — Ofertas Reales IA

Este documento describe la arquitectura del sistema y el flujo de datos de
extremo a extremo, desde que el bot de Telegram recibe una oferta hasta que el
sitio la muestra al público. Es complementario al
[`README.md`](../README.md), a [`docs/database-schema.md`](database-schema.md) y a
[`docs/telegram-integration.md`](telegram-integration.md).

## Visión general

Un bot de Telegram recibe mensajes con ofertas en un chat autorizado
(`chat.id = 5054325626`). El sistema valida, parsea, deduplica y persiste cada
oferta en Supabase PostgreSQL, que es la **fuente de verdad**. El sitio web
(Next.js App Router) renderiza el contenido por servidor (SSR) y se actualiza
casi en vivo mediante Supabase Realtime. Los productos enlazan a Amazon México y
Mercado Libre por enlaces de afiliado a través de un redirector propio
(`/api/click/[offerId]`), que registra una analítica mínima de clics.

El orden de prioridad de diseño que rige todo conflicto es:

```
seguridad > funcionalidad > claridad > accesibilidad > rendimiento > confianza > diseño visual > animación decorativa
```

Y el **principio de honestidad** (rector): el sistema nunca inventa datos. Lo que
no se puede derivar del mensaje queda vacío o en `needs_review` hasta acción del
administrador.

## Topología de ejecución

- **Vercel (serverless).** Aloja la app Next.js: Server Components, Route Handlers
  (`app/api/*`), Server Actions del panel y funciones Cron (`vercel.json`). El
  Route Handler del webhook y el del Cron corren en runtime **Node.js** (no Edge),
  porque necesitan `crypto.timingSafeEqual`, `sharp` y descargas binarias.
- **Supabase (servicios gestionados).** PostgreSQL (datos + RLS), Realtime
  (propagación de cambios), Storage (imágenes públicas) y Auth (sesión del
  administrador). El servidor usa la clave de rol de servicio; el navegador usa
  solo la clave anónima.
- **Telegram Bot API.** Origen de las actualizaciones mediante webhook saliente
  de Telegram hacia `/api/telegram/webhook`.

## Flujo de datos (Telegram → Web)

```
Telegram Bot API
   │  POST update + header X-Telegram-Bot-Api-Secret-Token
   ▼
/api/telegram/webhook  (Node, Vercel)
   1. Método: solo POST  ─────────────────────► 405 (sin leer el cuerpo)
   2. Secreto en tiempo constante ────────────► 401 (no coincide)
   3. Tamaño del cuerpo (límite ~1 MB) ───────► 413
   4. Validación de esquema con Zod ──────────► 400 (+ log técnico)
   5. Compuerta de chat (== 5054325626) ──────► 200 (ignora en silencio otros)
   │
   ▼  (lib/telegram/ingest.ts)
   6. Persistencia idempotente en telegram_updates (INSERT ON CONFLICT update_id)
   │     └─ ya en estado terminal → 200 (duplicado, no se reprocesa)
   ▼
   7. Parser de mensajes (lib/parser) → precios con decimal.js, título, categoría
   ▼
   8. Validación de dominios / SSRF (lib/ssrf) sobre el enlace de afiliado
   ▼
   9. Deduplicación por fingerprint e identidad (lib/dedup)
   │     ├─ coincide → UPDATE de la oferta existente (precio/descuento/fechas)
   │     └─ nueva   → continúa
   ▼
   10. Pipeline de imagen (lib/telegram/images): getFile → validar (sharp) →
       subir a Storage (offer-images); si falla/llega tarde → imagen de respaldo
       con image_status = 'pending' (el Cron reintenta)
   ▼
   11. Persistir la oferta en `offers` (PostgreSQL = fuente de verdad)
   │
   ├─► 200 rápido a Telegram
   ▼
Supabase Realtime  ──►  Sitio Web Next.js (actualización en vivo)

Vercel Cron (cada 5 min, /api/cron, protegido por CRON_SECRET):
   • Reintenta imágenes pending/failed con backoff exponencial
   • Expira ofertas active cuyo expires_at ya pasó (nunca expira expires_at null)
```

Cada paso corta antes del siguiente: el webhook valida transporte (método,
secreto, tamaño, esquema, chat) y delega el procesamiento idempotente a
`ingestUpdate`. Todas las salidas manejadas (insertada, actualizada, duplicada,
ignorada, rechazada) responden un **200 rápido**; solo un fallo interno real
(p. ej. la base de datos no responde) produce 5xx, para que Telegram reintente
con seguridad apoyándose en la idempotencia por `update_id`.

## SSR primero, Realtime como mejora progresiva

El contenido principal se renderiza en el servidor (Server Components):

- La lista inicial de ofertas se obtiene en el servidor y se entrega ya renderizada
  en el HTML. Esto garantiza **SEO** y funcionamiento **sin JavaScript** en el
  cliente.
- Encima de ese estado inicial, un componente cliente se suscribe a Supabase
  Realtime y aplica los cambios (INSERT/UPDATE) en vivo. Realtime es una **mejora
  progresiva**: si no carga, el contenido renderizado por servidor sigue siendo
  correcto y completo.

Así se respeta el orden de prioridad: claridad y rendimiento (contenido SSR) por
encima de la animación o la interactividad decorativa.

## Frontera servidor / cliente

| Capa | Ubicación | Acceso a secretos |
|------|-----------|-------------------|
| Webhook, Cron, Route Handlers `app/api/*`, Server Actions, Server Components | Servidor (Vercel) | Sí — `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET` |
| Client Components, hooks de Realtime, UI interactiva | Navegador | No — solo `NEXT_PUBLIC_*` |

- **Cliente del navegador** (`lib/supabase/browser.ts`): usa
  `createBrowserClient` de `@supabase/ssr` con la **clave anónima** y queda sujeto
  a RLS, por lo que solo recibe filas que puede ver (ofertas `active`).
- **Cliente del servidor con sesión** (`lib/supabase/server.ts`):
  `createServerClient` ligado a cookies, para leer la sesión del administrador.
- **Cliente de servicio** (`lib/supabase/service.ts`): usa
  `SUPABASE_SERVICE_ROLE_KEY`, **bypassa RLS** y es el único que escribe desde
  procesos de servidor (webhook, Cron, APIs admin). Vive en un módulo marcado
  `server-only`; cualquier intento de importarlo desde un Client Component es un
  error de build.

La validación de entorno (`lib/env.ts`, neutral; `lib/env.server.ts`,
`server-only`) separa el esquema público del de servidor, de modo que ningún
secreto pueda colarse al bundle del navegador.

### Compuerta del panel de administración

El archivo `middleware.ts` intercepta `/admin/**` y `/api/admin/**`: refresca la
sesión de Supabase Auth y exige que el correo del usuario pertenezca a
`ADMIN_EMAIL` (allowlist separada por coma). Sin sesión, redirige a
`/admin/login` (páginas) o responde 401/403 (APIs). Si falta el entorno público
de Supabase, falla de forma segura denegando el acceso.

## Estructura del proyecto

Disposición App Router (Next.js, TypeScript estricto). Cada carpeta tiene una
responsabilidad única.

```
.
├── app/
│   ├── (public)/                  # Grupo de rutas públicas (layout público)
│   │   ├── page.tsx               # / (inicio, SSR)
│   │   ├── ofertas/page.tsx       # /ofertas (lista, filtros por searchParams)
│   │   ├── ofertas/[slug]/        # /ofertas/[slug] (detalle) + opengraph-image
│   │   ├── amazon/page.tsx
│   │   ├── mercado-libre/page.tsx
│   │   ├── categorias/page.tsx
│   │   ├── categorias/[slug]/page.tsx
│   │   ├── como-funciona/page.tsx
│   │   ├── transparencia-afiliados/page.tsx
│   │   ├── privacidad/page.tsx
│   │   ├── terminos/page.tsx
│   │   └── contacto/page.tsx
│   ├── (admin)/                   # Grupo admin (layout admin, fuera de la nav pública)
│   │   └── admin/
│   │       ├── page.tsx
│   │       ├── login/page.tsx
│   │       ├── ofertas/page.tsx
│   │       ├── ofertas/[id]/page.tsx
│   │       ├── probar/                 # Panel para probar mensajes
│   │       └── telegram/page.tsx
│   └── api/
│       ├── telegram/webhook/route.ts   # Ingesta del webhook (Node)
│       ├── offers/route.ts             # Lista pública (paginación keyset)
│       ├── offers/[id]/route.ts
│       ├── click/[offerId]/route.ts    # Redirector de afiliado + analítica
│       ├── admin/offers/route.ts
│       ├── admin/telegram/status/route.ts
│       └── cron/route.ts               # Reintento de imágenes + expiración (protegido)
├── components/
│   ├── ui/                        # Primitivos de UI adaptados a tokens
│   ├── offers/                    # OfferCard, OfferGrid, OfferDetail, filtros…
│   ├── layout/                    # Header, Footer, navegación, tema…
│   ├── seo/                       # JSON-LD y metadatos
│   └── admin/                     # Tablas y editores del panel
├── lib/
│   ├── supabase/                  # browser.ts, server.ts, service.ts, types.ts
│   ├── telegram/                  # schema (Zod), secret, ingest, images, files,
│   │                              #   register, cron, status, adapters, *-deps
│   ├── parser/                    # normalización, precios, descuento, categoría
│   ├── ssrf/                      # validador de dominios y resolución segura
│   ├── dedup/                     # fingerprint, resolución de duplicados, slug
│   ├── offers/                    # consultas y mapeos de ofertas
│   ├── seo/                       # utilidades de SEO
│   ├── ui/                        # helpers de UI
│   ├── utils/                     # dinero (Decimal), formato, fechas, clases
│   ├── admin/                     # allowlist y utilidades de admin
│   ├── env.ts                     # validación Zod (neutral: público + validador)
│   └── env.server.ts              # entorno de servidor (server-only)
├── supabase/
│   ├── migrations/                # 0001…0005 (esquema, RLS, índices, Storage)
│   └── seed.sql                   # datos de demostración (claramente ficticios)
├── scripts/
│   └── register-telegram-webhook.ts   # CLI: set | status
├── tests/
│   ├── unit/                      # parser, ssrf, dedup, dinero, slug… (+ property-based)
│   ├── integration/               # webhook, RLS, constraints, API (omitidas sin DB)
│   ├── e2e/                       # Playwright + @axe-core/playwright
│   └── fixtures/                  # datos de prueba
├── docs/                          # architecture, database-schema, telegram-integration…
├── public/                        # logo, favicon, imagen de respaldo (fallback-offer.svg)
├── middleware.ts                  # compuerta de /admin y /api/admin
└── vercel.json                    # Cron */5 * * * * → /api/cron
```

Notas de diseño:

- `lib/` concentra **lógica pura y testeable** (parser, ssrf, dedup, dinero,
  slug, decisiones del cron), aislada de la I/O. Las operaciones efectivas
  (descarga de imagen, persistencia, llamadas a Telegram) se inyectan como
  **puertos**, de modo que el pipeline se ejercita en pruebas con mocks en
  memoria, sin base de datos, bot ni red reales.
- `app/api/` contiene la I/O (webhook, redirector, APIs admin, cron) que orquesta
  `lib/`.
- `supabase/migrations/` es la **única** fuente de verdad del esquema.

## Confiabilidad del webhook: ack rápido + idempotencia + Cron

Telegram espera una respuesta 2xx rápida y reintenta si recibe error, timeout o
5xx. La idempotencia se ancla en `update_id` (PK de `telegram_updates`) y en la
unicidad de `(telegram_chat_id, telegram_message_id)` en `offers`, así que un
reintento nunca duplica efectos. La estrategia es:

1. **Persistir primero, idempotente:** `INSERT ... ON CONFLICT (update_id) DO
   NOTHING`. Si la fila ya está en estado terminal (`processed`, `duplicate`,
   `ignored`, `rejected`), se responde 200 sin reprocesar. Si está en
   `received`/`error`, se reintenta con seguridad.
2. **Procesar dentro de un presupuesto de tiempo acotado:** el parseo y la
   validación de URL son rápidos; la descarga de imagen es la operación lenta y
   se intenta con timeout corto.
3. **Degradar con respaldo, no fallar:** si la imagen no está lista a tiempo, la
   oferta se guarda igual con imagen de respaldo e `image_status='pending'`.
4. **Cron de mantenimiento:** reintenta imágenes pendientes/fallidas con backoff y
   expira ofertas vencidas; los cambios se propagan por Realtime.

Ver el detalle del contrato del endpoint y del Cron en
[`docs/telegram-integration.md`](telegram-integration.md).
