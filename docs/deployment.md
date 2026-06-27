# Despliegue — Ofertas Reales IA

Runbook para desplegar en **Vercel** con **Supabase** como backend. Combina los
pasos automáticos (build de Vercel) con las operaciones **manuales** que deben
hacerse una vez por entorno. El objetivo es un despliegue que **falle rápido y
claro** si falta configuración, y que nunca exponga secretos.

Topología: la app Next.js 15 (App Router) corre en Vercel (Server Components,
Route Handlers `/api/*`, Server Actions y el Cron). El Route Handler del webhook
corre en **runtime Node.js** (necesita `crypto.timingSafeEqual`, `sharp` y
descargas binarias), no Edge. Supabase aporta Postgres + RLS, Realtime, Storage
y Auth.

## 0. Prerrequisitos

- Cuenta de Vercel y proyecto enlazado al repositorio.
- Proyecto de Supabase (ver paso 1).
- Bot de Telegram con un **token válido y NO comprometido**. Si el token previo
  estuvo expuesto, **revócalo y genera uno nuevo** antes de continuar (ver la
  sección de rotación en [`security.md`](./security.md)).

## 1. Crear el proyecto de Supabase

1. Crea un proyecto nuevo en Supabase y anota la **URL del proyecto** y las
   claves **anónima** y de **rol de servicio**.
2. Habilita **Supabase Auth** (correo) para el inicio de sesión del administrador.

## 2. Configurar las variables de entorno

Define todas las variables en el entorno de despliegue (Vercel → Project →
Settings → Environment Variables) y, en local, en `.env.local` (ignorado por
Git). **Los secretos del servidor nunca llevan `NEXT_PUBLIC_` y nunca se
versionan.**

| Variable | Dónde | Tipo | Valor / nota |
|----------|-------|------|--------------|
| `NEXT_PUBLIC_SITE_URL` | Vercel + local | Público | URL del sitio (debe estar presente **en build**) |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | Público | URL del proyecto Supabase (presente en build) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | Público | Clave anónima (presente en build) |
| `NEXT_PUBLIC_WHATSAPP_INVITE_URL` | Vercel + local | Público | Enlace de invitación al grupo |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + local | **Servidor (secreto)** | Bypassa RLS; solo servidor |
| `TELEGRAM_BOT_TOKEN` | Vercel + local | **Servidor (secreto)** | Token del bot (nuevo/rotado) |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel + local | **Servidor (secreto)** | `secret_token` del webhook |
| `CRON_SECRET` | Vercel + local | **Servidor (secreto)** | Protege `/api/cron` |
| `ADMIN_EMAIL` | Vercel + local | **Servidor** | Allowlist de admins, separada por coma |
| `TELEGRAM_ALLOWED_CHAT_ID` | Vercel + local | Servidor | `5054325626` |
| `AMAZON_TRACKING_ID` | Vercel + local | Servidor | `programadormx-20` |
| `SHOW_AMAZON_PRICES` | Vercel + local | Servidor | `true` / `false` |

> **Importante — variables `NEXT_PUBLIC_*` en build.** Se **incrustan en el
> bundle** en tiempo de compilación, así que deben estar presentes **antes** del
> `next build` (no solo en runtime).

> **`SKIP_ENV_VALIDATION` es solo de build.** Cuando es "truthy" (1/true/yes/on),
> la validación de entorno **no** aborta el `next build` aunque falten variables
> (útil en CI o checkouts limpios). **No la definas en el runtime de
> producción**: ahí el fallo rápido ante una variable faltante es el
> comportamiento deseado (R27.4).

## 3. Aplicar migraciones y seeds

El esquema es la **única fuente de verdad** y vive en `supabase/migrations/`.
Aplica las migraciones **en orden** y luego el seed:

1. `0001_init.sql` — extensiones, categorías, enums, tabla `offers`.
2. `0002_aux_tables.sql` — `telegram_updates`, `offer_clicks`,
   `admin_audit_logs`, `admin_allowlist`.
3. `0003_indexes_triggers.sql` — índices y triggers.
4. `0004_rls.sql` — políticas Row Level Security y `is_admin()`.
5. `0005_storage.sql` — políticas del bucket de Storage.
6. `supabase/seed.sql` — datos de demostración (R24): cubre ofertas activa,
   recién publicada, destacada, sin precio original, expirada y `needs_review`,
   más Amazon, Mercado Libre y una sin imagen.

Puedes aplicarlas con el flujo de migraciones de la CLI de Supabase o ejecutando
el SQL en orden contra la base del proyecto.

> **Sincroniza `admin_allowlist` con `ADMIN_EMAIL`.** Como Postgres no lee
> variables de entorno desde RLS, la tabla `admin_allowlist` debe poblarse con
> los correos de `ADMIN_EMAIL` (tarea del seed/deploy). Mantenlas alineadas cada
> vez que cambie `ADMIN_EMAIL`.

## 4. Storage: bucket `offer-images`

1. Crea (o verifica) el bucket **`offer-images`** con **lectura pública**.
2. La **escritura** queda restringida al rol de servicio (las políticas de
   `0005_storage.sql` deniegan `insert`/`update`/`delete` a `anon`). Las imágenes
   las sube el Procesador de Imágenes en el servidor; las URLs almacenadas son
   públicas y estables, nunca URLs temporales de Telegram.

## 5. Realtime sobre `offers`

Habilita la **publicación de Realtime** para la tabla `public.offers` en el
proyecto Supabase. El sitio funciona completo aun sin Realtime (la primera carga
es SSR), pero Realtime es lo que propaga inserciones, actualizaciones de precio y
expiraciones a los clientes conectados (R9). Como el navegador usa la clave
anónima, Realtime respeta RLS: el cliente solo recibe cambios de filas `active`.

## 6. Cron de Vercel

El Cron ya está declarado en `vercel.json`:

```json
{ "crons": [ { "path": "/api/cron", "schedule": "*/5 * * * *" } ] }
```

Corre cada 5 minutos: reintenta imágenes `pending`/`failed` con backoff y marca
`expired` las ofertas `active` cuyo `expires_at` ya transcurrió (R3.8, R9.10). El
endpoint `/api/cron` está protegido por **`CRON_SECRET`**; asegúrate de que esa
variable esté configurada en Vercel para que la invocación programada se
autentique y nadie pueda dispararlo públicamente.

## 7. Desplegar la app

Despliega en Vercel (push a la rama conectada o `vercel --prod`). El build
ejecuta `next build` con las variables ya configuradas. Si falta una variable
requerida en producción y `SKIP_ENV_VALIDATION` no está activa, el arranque
falla con un mensaje claro que lista solo los **nombres** de las variables
faltantes.

## 8. Registrar el webhook de Telegram

Una vez que el sitio está en línea, registra el webhook con el script de línea de
comandos (no hay endpoint público para esto). Carga las variables de entorno
(`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, URL del sitio) y ejecuta el
script con tu runner de TypeScript (p. ej. `npx tsx`):

```bash
# Registrar/actualizar el webhook
npx tsx scripts/register-telegram-webhook.ts set

# Consultar el estado actual (URL, pendientes, último error)
npx tsx scripts/register-telegram-webhook.ts status
```

- `set` llama a `setWebhook` apuntando a `/api/telegram/webhook`, fija
  `secret_token = TELEGRAM_WEBHOOK_SECRET` y habilita solo los `allowed_updates`
  necesarios (`message`, `edited_message`, `channel_post`, `edited_channel_post`).
- `status` llama a `getWebhookInfo`.
- El script **nunca imprime** el Token del Bot ni el `secret_token`, y aborta con
  un mensaje claro si falta `TELEGRAM_BOT_TOKEN`.

## 9. Checklist de verificación post-despliegue

- [ ] El sitio carga y la lista de ofertas aparece por SSR (funciona aun sin
      Realtime).
- [ ] `set`/`status` del script muestran el webhook apuntando a
      `https://<sitio>/api/telegram/webhook` sin errores pendientes.
- [ ] Un mensaje de prueba en el **Chat Autorizado** (`chat.id = 5054325626`)
      crea una oferta; un mensaje desde otro chat se ignora en silencio.
- [ ] Reenviar/duplicar una actualización **no** crea ofertas duplicadas
      (idempotencia por `update_id`).
- [ ] Realtime: una oferta nueva aparece sin recargar; un cambio de precio se
      refleja; una expiración la retira de la lista.
- [ ] `/admin` exige inicio de sesión y solo admite correos de `ADMIN_EMAIL`; las
      rutas admin no aparecen en la navegación pública.
- [ ] Un Visitante Público no puede leer `telegram_updates`, `admin_audit_logs`
      ni `offer_clicks`, y solo ve ofertas `active` (RLS).
- [ ] El Cron `/api/cron` responde solo con `CRON_SECRET` válido; las imágenes
      `pending` se reintentan y las ofertas vencidas pasan a `expired`.
- [ ] Las imágenes se sirven desde el bucket público `offer-images` (URLs
      estables, sin token).
- [ ] Verifica que **ningún** secreto aparezca en los logs de Vercel ni en
      respuestas de error (solo nombres de variables, nunca valores).
- [ ] `SKIP_ENV_VALIDATION` **no** está definida en el runtime de producción.

## Operación continua

- **Rotación de secretos:** ante cualquier sospecha de exposición, revoca y
  regenera (Token del Bot vía BotFather; claves de Supabase desde el panel) y
  actualiza las variables en Vercel. Nunca commits con secretos.
- **Cambios de esquema:** añade una nueva migración versionada en
  `supabase/migrations/`; no edites migraciones ya aplicadas.
- **`ADMIN_EMAIL`:** al cambiarlo, re-sincroniza `admin_allowlist`.
