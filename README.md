# Ofertas Reales IA

Plataforma web de ofertas reales en tiempo real para México. Un bot de Telegram
recibe ofertas en un chat autorizado; el sistema las valida, parsea, deduplica y
almacena en Supabase (PostgreSQL), y el sitio (Next.js App Router) las muestra y
se actualiza casi en vivo mediante Supabase Realtime. Los productos enlazan a
Amazon México y Mercado Libre por enlaces de afiliado a través de un redirector
propio.

> Principio rector de honestidad: el sistema nunca inventa datos. No se generan
> reseñas, existencias, contadores de urgencia, cifras de ventas ni insignias de
> "verificado" sin fundamento. Los campos que no se pueden derivar del mensaje
> quedan vacíos o en `needs_review` hasta que el administrador actúe.

Documentación complementaria:

- [`docs/architecture.md`](docs/architecture.md) — arquitectura y flujo de datos Telegram → Web.
- [`docs/database-schema.md`](docs/database-schema.md) — esquema de base de datos, RLS y Storage.
- [`docs/telegram-integration.md`](docs/telegram-integration.md) — webhook, seguridad, imágenes y Cron.

---

## 1. Requisitos

- **Node.js 20 LTS** (mínimo 18.18). Next.js 15 requiere `^18.18 || ^19.8 || >= 20`.
- **npm** (incluido con Node). El repo usa `package-lock.json`.
- **Un proyecto de Supabase** (PostgreSQL + Realtime + Storage + Auth).
- **Un bot de Telegram** creado con [@BotFather](https://t.me/BotFather).
- **Vercel** (opcional, recomendado para despliegue y para el Cron).
- Para las pruebas end-to-end: navegadores de Playwright (ver §11).

## 2. Instalación

```bash
npm install
```

Para poder ejecutar las pruebas end-to-end, instala los navegadores de Playwright
(una sola vez por máquina):

```bash
npx playwright install
```

## 3. Variables de entorno

Copia el archivo de ejemplo y rellena los valores en tu entorno local:

```bash
# PowerShell
Copy-Item .env.example .env.local
# bash / zsh
cp .env.example .env.local
```

`.env.example` **se versiona**, así que nunca debe contener valores reales de
secretos. En producción configura las variables en el entorno de despliegue
(Vercel/Supabase), no en Git.

Regla de seguridad clave: **los secretos del servidor jamás usan el prefijo
`NEXT_PUBLIC_`**. Toda variable `NEXT_PUBLIC_*` se incrusta en el bundle del
navegador; colocar un secreto ahí lo expondría a cualquier visitante. La
validación de arranque (`lib/env.ts` + `lib/env.server.ts`) aborta el despliegue
en producción si falta una variable requerida, listando solo los **nombres** de
las variables, nunca sus valores.

| Variable | Ámbito | Dónde se usa | Notas |
|----------|--------|--------------|-------|
| `NEXT_PUBLIC_SITE_URL` | Público | Cliente y servidor; construye la URL del webhook y URLs canónicas | `https://programadormx.online` |
| `NEXT_PUBLIC_SUPABASE_URL` | Público | Clientes Supabase (navegador y servidor); host permitido de `next/image` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público | Cliente Supabase del navegador (sujeto a RLS) y Realtime | Clave anónima; **no** es secreta pero **no** bypassa RLS |
| `NEXT_PUBLIC_WHATSAPP_INVITE_URL` | Público | CTA "Unirme al grupo" | Enlace de invitación |
| `SUPABASE_SERVICE_ROLE_KEY` | **Servidor (secreto)** | `lib/supabase/service.ts` (escrituras del servidor; bypassa RLS) | Jamás llega al cliente |
| `TELEGRAM_BOT_TOKEN` | **Servidor (secreto)** | Script de registro y descarga de imágenes (`getFile`) | Token del bot |
| `TELEGRAM_WEBHOOK_SECRET` | **Servidor (secreto)** | Validación del header `X-Telegram-Bot-Api-Secret-Token` | `secret_token` del webhook |
| `CRON_SECRET` | **Servidor (secreto)** | Protege `/api/cron` (`Authorization: Bearer …`) | Lo envía Vercel Cron |
| `ADMIN_EMAIL` | **Servidor** | Allowlist de administradores (middleware + seed de `admin_allowlist`) | Uno o varios correos separados por coma |
| `TELEGRAM_ALLOWED_CHAT_ID` | **Servidor** | Compuerta de chat del webhook | `5054325626` (no secreto) |
| `AMAZON_TRACKING_ID` | **Servidor** | Construcción de enlaces de afiliado de Amazon | `programadormx-20` (no secreto) |
| `SHOW_AMAZON_PRICES` | **Servidor** | Conmuta la visualización de precios de Amazon en la UI | `true`/`false` (no secreto) |
| `SKIP_ENV_VALIDATION` | Solo build | Permite `next build` sin secretos reales | Ver §12; **nunca** en runtime de producción |

## 4. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **Project Settings → API** copia:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (secreto del servidor)

La clave `service_role` **bypassa RLS** por diseño: solo se usa en módulos del
servidor (`server-only`) y nunca debe configurarse como `NEXT_PUBLIC_*`.

## 5. Migraciones

El esquema vive como SQL versionado bajo `supabase/migrations/` y es la **única
fuente de verdad**. Aplícalas en orden:

| Archivo | Contenido |
|---------|-----------|
| `0001_init.sql` | Extensión `pgcrypto`, enums `offer_status`/`platform_t`, tabla `offers` con sus CHECKs |
| `0002_aux_tables.sql` | `offer_categories`, `telegram_updates`, `offer_clicks`, `admin_audit_logs` |
| `0003_indexes_triggers.sql` | Slug único, índices de fingerprint y `(platform, external_product_id)`, índice único parcial `(telegram_chat_id, telegram_message_id)`, índices parciales `where status='active'`, trigger de `updated_at` y la FK `offers.category_id` |
| `0004_rls.sql` | RLS en todas las tablas, tabla `admin_allowlist` y función `is_admin()` |
| `0005_storage.sql` | Bucket `offer-images` y su política de lectura pública |

Dos formas de aplicarlas:

- **SQL Editor del dashboard de Supabase:** pega y ejecuta el contenido de cada
  archivo en orden (`0001` → `0005`). Las migraciones son idempotentes (usan
  `if not exists` y bloques guardados), así que reaplicarlas no produce error.
- **Supabase CLI:**

  ```bash
  supabase db push
  ```

Datos de demostración (opcional, claramente ficticios): aplica `supabase/seed.sql`
para poblar categorías y ofertas demo que cubren todos los estados (activa,
recién publicada, destacada, sin precio original, expirada, `needs_review`, y
una sin imagen). Las marcas y precios son inventados; nada representa un producto
real vigente.

> `seed.sql` **no** inserta un correo en `admin_allowlist` (el SQL crudo no lee
> variables de entorno). Sincroniza esa tabla con `ADMIN_EMAIL` en el despliegue;
> ver §13 y `docs/database-schema.md`.

## 6. Storage

La migración `0005_storage.sql` crea el bucket público `offer-images` y su
política: lectura pública por URL, escritura solo del servidor (rol de servicio).
En algunos proyectos conviene además crear el bucket desde el dashboard; la
migración deja la política como fuente de verdad reproducible. Las imágenes
almacenadas son URLs públicas y estables del bucket, nunca URLs temporales de
Telegram.

## 7. Realtime

El sitio se actualiza en vivo escuchando cambios de la tabla `offers`. Habilita
la replicación de Realtime para esa tabla:

- En el dashboard de Supabase: **Database → Replication** (o **Realtime**) y
  añade `public.offers` a la publicación de Realtime.
- El cliente del navegador escucha con la clave anónima, por lo que solo recibe
  los cambios de filas que RLS le permite ver (ofertas `active`).

## 8. Telegram (bot y secretos)

1. Crea el bot con [@BotFather](https://t.me/BotFather) y copia el token en
   `TELEGRAM_BOT_TOKEN` (secreto del servidor).
2. Genera un `TELEGRAM_WEBHOOK_SECRET` aleatorio y robusto (p. ej. una cadena
   larga aleatoria). Telegram lo devolverá en cada petición mediante el header
   `X-Telegram-Bot-Api-Secret-Token`, y el webhook lo compara en tiempo constante.
3. `TELEGRAM_ALLOWED_CHAT_ID` ya viene con el chat autorizado (`5054325626`): solo
   se procesan ofertas provenientes de ese chat.

Detalles de seguridad y procesamiento en
[`docs/telegram-integration.md`](docs/telegram-integration.md).

## 9. Registro del webhook

El registro se hace con un script de línea de comandos (no hay endpoint público
para ello). El script lee `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` y
`NEXT_PUBLIC_SITE_URL` del entorno, y nunca imprime el token ni el secreto.

Como es un proceso Node independiente, las variables deben estar presentes en el
entorno del shell (un proceso `tsx` no carga `.env.local` automáticamente como sí
hace Next.js). En PowerShell:

```powershell
$env:TELEGRAM_BOT_TOKEN = "<token-del-bot>"
$env:TELEGRAM_WEBHOOK_SECRET = "<tu-secreto-de-webhook>"
$env:NEXT_PUBLIC_SITE_URL = "https://programadormx.online"

# Registrar el webhook (setWebhook con secret_token y allowed_updates mínimos)
npx tsx scripts/register-telegram-webhook.ts set

# Consultar el estado (getWebhookInfo: URL, pendientes, último error)
npx tsx scripts/register-telegram-webhook.ts status
```

El modo `set` registra la URL `${NEXT_PUBLIC_SITE_URL}/api/telegram/webhook` con
el `secret_token` y `allowed_updates = [message, edited_message, channel_post,
edited_channel_post]`. El modo `status` muestra la URL configurada, el número de
actualizaciones pendientes y el último error, sin revelar secretos.

## 10. Desarrollo local

```bash
npm run dev
```

Levanta el servidor de desarrollo de Next.js (por defecto en
`http://localhost:3000`). Para probar el webhook contra tu máquina local
necesitas una URL pública (p. ej. un túnel) y registrar esa URL con el script de §9.

## 11. Pruebas

```bash
npm run typecheck   # tsc --noEmit (comprobación de tipos)
npm run lint        # next lint
npm test            # vitest run (unitarias + property-based con fast-check)
npm run e2e         # playwright test (requiere 'npx playwright install')
```

Las pruebas de integración contra base de datos (`tests/integration/`) están
**omitidas** salvo que definas `TEST_DATABASE_URL` apuntando a una base de datos
**desechable**. Por ejemplo:

```powershell
docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15
$env:TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres"
npm test
```

Sin `TEST_DATABASE_URL`, `npm test` se mantiene verde ejecutando solo las suites
que no requieren base de datos.

## 12. Build

```bash
npm run build
```

`next build` corre con `NODE_ENV=production`, por lo que la validación de entorno
aborta si falta una variable requerida. Para compilar en un entorno **sin
credenciales reales** (CI, checkout limpio), usa el escape de solo build:

```powershell
$env:SKIP_ENV_VALIDATION = "1"
npm run build
```

`SKIP_ENV_VALIDATION` **solo** debe usarse en tiempo de compilación. En el runtime
de producción nunca debe definirse: ahí el fallo rápido ante una variable faltante
es el comportamiento deseado.

## 13. Despliegue (Vercel)

1. Importa el repositorio en Vercel.
2. Configura **todas** las variables de §3 en **Project Settings → Environment
   Variables**. Marca como secretos (sin `NEXT_PUBLIC_`) a
   `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` y
   `CRON_SECRET`.
3. El Cron está declarado en `vercel.json` y llama a `/api/cron` cada 5 minutos
   (`*/5 * * * *`). Cuando `CRON_SECRET` está configurado, Vercel envía
   automáticamente `Authorization: Bearer <CRON_SECRET>`, que la ruta compara en
   tiempo constante.
4. `next/image` solo optimiza imágenes del host derivado de
   `NEXT_PUBLIC_SUPABASE_URL` (ruta `/storage/v1/object/public/**`); asegúrate de
   tener esa variable configurada.
5. Sincroniza `admin_allowlist` con `ADMIN_EMAIL` (un correo por fila, en
   minúsculas) para que el panel de administración reconozca a los administradores.
6. Tras el primer despliegue, ejecuta el registro del webhook de §9 apuntando a la
   URL de producción.

## 14. Seguridad

- **Token de Telegram comprometido:** si un `TELEGRAM_BOT_TOKEN` se expuso alguna
  vez (por ejemplo en Git o en logs), debe considerarse **comprometido**.
  Revócalo de inmediato con [@BotFather](https://t.me/BotFather) (`/revoke` o
  regenerando el token) y genera uno nuevo. Coloca el token nuevo **solo** en
  `.env.local` (desarrollo) y en las variables de entorno de Vercel (producción).
  **Nunca** lo escribas en `.env.example`, en el código ni en ningún archivo que
  se versione en Git. Tras rotarlo, vuelve a registrar el webhook (§9).
- **Secretos solo del servidor:** `SUPABASE_SERVICE_ROLE_KEY`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` y `CRON_SECRET` jamás usan el
  prefijo `NEXT_PUBLIC_` ni se imprimen en logs.
- **RLS:** Row Level Security está habilitado en todas las tablas sensibles. El
  público solo lee ofertas `active`; no puede leer payloads de Telegram, registros
  de auditoría, analítica de clics ni la allowlist. Ver `docs/database-schema.md`.
- **Compuerta de chat:** el webhook solo procesa mensajes del chat autorizado
  `5054325626`; cualquier otro chat se ignora en silencio.
- **Panel de administración:** protegido por middleware que verifica la sesión de
  Supabase Auth y que el correo esté en `ADMIN_EMAIL`.

## 15. Solución de problemas

- **El build falla por variables de entorno faltantes.** Configura las variables
  de §3, o usa `SKIP_ENV_VALIDATION=1` solo para builds sin credenciales (§12).
  El mensaje lista nombres de variables, nunca valores.
- **El webhook responde 401.** El header `X-Telegram-Bot-Api-Secret-Token` no
  coincide con `TELEGRAM_WEBHOOK_SECRET`. Vuelve a registrar el webhook (§9) con
  el secreto correcto.
- **El webhook responde 405.** Solo se acepta `POST`; cualquier otro método se
  rechaza sin leer el cuerpo.
- **Las ofertas no aparecen en vivo.** Verifica que Realtime esté habilitado para
  `public.offers` (§7) y que la oferta esté en estado `active` (RLS solo expone
  `active` al público).
- **Las imágenes no se optimizan.** Confirma `NEXT_PUBLIC_SUPABASE_URL`; el patrón
  remoto de `next/image` se deriva de ese host.
- **El script de registro aborta diciendo que falta el token.** Exporta
  `TELEGRAM_BOT_TOKEN` en el shell antes de ejecutarlo (§9); el proceso `tsx` no
  carga `.env.local` por sí solo.
- **`npm test` "salta" pruebas de base de datos.** Es lo esperado: defínelas con
  `TEST_DATABASE_URL` apuntando a una base de datos desechable (§11).
- **No puedo entrar al panel `/admin`.** Tu correo debe estar en `ADMIN_EMAIL` y
  en `admin_allowlist`, y debes tener sesión de Supabase Auth iniciada.
