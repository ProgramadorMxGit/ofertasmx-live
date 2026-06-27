# Seguridad — Ofertas Reales IA

Este documento describe los mecanismos de seguridad implementados y los
procedimientos operativos obligatorios. La seguridad es la prioridad más alta
del producto: ante cualquier conflicto de diseño, gana la opción más segura.

Principio transversal: **ningún secreto aparece nunca como valor literal** en el
código, en los logs, en los mensajes de error ni en este repositorio. Los
secretos se referencian solo por el **nombre** de su variable de entorno.

## Gestión de secretos (R8.7, R27.2, R27.5)

- **Exclusivos del servidor.** `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_WEBHOOK_SECRET` y `CRON_SECRET` **no** llevan el prefijo
  `NEXT_PUBLIC_` y por tanto nunca se incrustan en el bundle del navegador.
- **`ADMIN_EMAIL`** (allowlist de administradores, uno o varios correos
  separados por coma) también es variable de servidor.
- **Frontera estricta.** La clave de rol de servicio se instancia únicamente en
  `lib/supabase/service.ts` (marcado `server-only`); cualquier import accidental
  desde un Client Component rompe el build, como defensa contra fugas. El cliente
  de navegador usa solo la **clave anónima** y queda sujeto a RLS.
- **Nunca en logs.** El logger estructurado del servidor excluye el Token del Bot,
  el secreto del webhook y la clave de servicio, y omite datos personales
  innecesarios. Los logs registran identificadores no sensibles (`update_id`,
  `offer_id`) (R1.16, R1.7, R27.5). Esto está cubierto por la Propiedad 15
  ("ausencia de secretos en logs y mensajes").
- **Validación de entorno al arranque.** `lib/env.ts` / `lib/env.server.ts`
  validan las variables con Zod al iniciar. En producción, si falta una variable
  requerida, el arranque **falla rápido** con un mensaje claro que lista solo los
  **NOMBRES** de las variables faltantes, nunca sus valores (R27.3, R27.4, R27.5).

### Inventario de variables

| Variable | Ámbito | Notas |
|----------|--------|-------|
| `NEXT_PUBLIC_SITE_URL` | Público | URL del sitio |
| `NEXT_PUBLIC_SUPABASE_URL` | Público | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público | Clave anónima (sujeta a RLS) |
| `NEXT_PUBLIC_WHATSAPP_INVITE_URL` | Público | CTA "Unirme al grupo" |
| `SUPABASE_SERVICE_ROLE_KEY` | **Servidor (secreto)** | Bypassa RLS; jamás al cliente |
| `TELEGRAM_BOT_TOKEN` | **Servidor (secreto)** | Token del bot de Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | **Servidor (secreto)** | `secret_token` del webhook |
| `CRON_SECRET` | **Servidor (secreto)** | Protege `/api/cron` |
| `ADMIN_EMAIL` | **Servidor** | Allowlist de admins, separada por coma |
| `TELEGRAM_ALLOWED_CHAT_ID` | Servidor (no secreto) | `5054325626` |
| `AMAZON_TRACKING_ID` | Servidor (no secreto) | `programadormx-20` |
| `SHOW_AMAZON_PRICES` | Servidor (no secreto) | Conmuta visualización de precios Amazon |

`.env.example` se versiona con valores vacíos o seguros; **nunca** debe contener
valores reales de secretos.

## ⚠️ Rotación obligatoria del Token del Bot (token comprometido)

El Token del Bot de Telegram usado previamente quedó **expuesto y se considera
comprometido**. Antes de operar en producción es **obligatorio** rotarlo:

1. **Revocar** el token actual en Telegram. En un chat con
   [@BotFather](https://t.me/BotFather): `/revoke` → seleccionar el bot. Esto
   invalida de inmediato el token expuesto, de modo que ya no sirva a nadie.
2. **Generar uno nuevo** (BotFather entrega el token nuevo al revocar, o con
   `/token`).
3. **Almacenarlo solo en el entorno**, nunca en Git: en desarrollo, en
   `.env.local` (ignorado por Git); en producción, en las variables de entorno
   de Vercel/Supabase. El valor **no** se escribe en `.env.example`, ni en código,
   ni en este documento, ni en ningún log.
4. **Re-registrar el webhook** con el token nuevo y un `TELEGRAM_WEBHOOK_SECRET`
   nuevo (ver [`deployment.md`](./deployment.md)).
5. **Verificar** con el modo `status` del script de registro que el webhook
   apunta al sitio correcto y no hay errores pendientes.

Trata cualquier secreto que haya estado en el historial de Git o en un mensaje
como comprometido y rótalo siguiendo el mismo patrón.

## Cadena de seguridad del webhook (`/api/telegram/webhook`, R1)

El handler corre en runtime Node.js (necesita `crypto.timingSafeEqual`, `sharp`
y descargas binarias). Aplica guardas en orden, cada una cortando antes de la
siguiente:

1. **Método** — solo `POST`; cualquier otro → `405` sin leer el cuerpo
   (R1.1, R1.2).
2. **Secreto en tiempo constante** — compara el encabezado
   `X-Telegram-Bot-Api-Secret-Token` con `TELEGRAM_WEBHOOK_SECRET` usando
   `crypto.timingSafeEqual` sobre buffers; longitudes distintas devuelven `false`
   con seguridad. Desigualdad → `401` sin procesar el cuerpo (R1.3, R1.4).
   Verificado por la Propiedad 14.
3. **Tamaño** — si el cuerpo supera el límite configurado (p. ej. 1 MB) → `413`
   antes de parsear (R1.5).
4. **Esquema Zod** — valida la forma del Update antes de tocar cualquier campo;
   fallo → `400` + log técnico sin datos personales innecesarios (R1.6, R1.7).
   Reconoce `message`, `edited_message`, `channel_post` y `edited_channel_post`.
5. **Compuerta de Chat Autorizado** — procesa ofertas solo si
   `chat.id === 5054325626` (`TELEGRAM_ALLOWED_CHAT_ID`); cualquier otro chat se
   ignora en silencio, registra solo un evento técnico y responde `200`
   (R1.10, R1.11). Verificado por la Propiedad 13.
6. **Idempotencia + procesamiento + ack** según la estrategia de cuatro tiempos.

Un fallo **interno** real responde 5xx para que Telegram reintente con
seguridad; los reintentos no duplican efectos gracias a la idempotencia (R1.15).

### Idempotencia (R1.12, R1.13, R1.15)

- `telegram_updates.update_id` es **clave primaria**: el primer paso tras las
  guardas es `INSERT ... ON CONFLICT (update_id) DO NOTHING`. Si la fila ya está
  en estado terminal (`processed`/`duplicate`/`ignored`/`rejected`), se responde
  `200` sin reprocesar.
- `offers` impone **unicidad de `telegram_message_id` dentro del Chat
  Autorizado** (índice único sobre `(telegram_chat_id, telegram_message_id)`),
  de modo que un mismo mensaje no genera ofertas duplicadas.
- Resultado (Propiedad 12): procesar una actualización una o varias veces tiene
  el mismo efecto que procesarla una sola vez.

### Registro del webhook (R2)

El registro se hace con el script de línea de comandos
`scripts/register-telegram-webhook.ts` (no hay endpoint público para
registrar/eliminar el webhook — R2.6). Lee el token solo de `TELEGRAM_BOT_TOKEN`
(aborta claro si falta), configura `secret_token = TELEGRAM_WEBHOOK_SECRET` y
solo los `allowed_updates` necesarios, y **nunca imprime** el token ni el
secreto (R2.1–R2.5, R2.7).

## Protecciones SSRF y validación de dominios (R5)

Toda URL proveniente de Telegram pasa por `lib/ssrf/` antes de cualquier
solicitud. Allowlist inicial configurable: `amazon.com.mx`, `www.amazon.com.mx`,
`amzn.to`, `mercadolibre.com.mx`, `www.mercadolibre.com.mx`, `meli.la`.

Se **rechaza** (sin realizar ninguna solicitud) una URL que:

- no use el esquema **HTTPS**;
- apunte a `localhost`, a una IP **privada/reservada** (RFC 1918, loopback,
  link-local `169.254.0.0/16`), o a un **endpoint de metadatos de nube**
  (`169.254.169.254`, `metadata.google.internal`);
- contenga **credenciales embebidas** (`usuario:clave@`);
- cuyo dominio (o dominio padre) **no** esté en la allowlist.

Al resolver enlaces cortos (`amzn.to`, `meli.la`) para extraer identificadores,
el resolutor aplica: **límite de redirecciones** (p. ej. ≤ 3), **timeout**
(p. ej. 5 s) y **tamaño máximo de respuesta**; y en **cada salto** re-valida
esquema/host contra la allowlist y resuelve DNS verificando que la IP no sea
privada/reservada (mitiga **DNS rebinding**), confirmando que el **dominio final**
siga permitido. Cubierto por la Propiedad 8.

## Redirector de clics cerrado (`/api/click/[offerId]`, R11)

Diseño anti redirección abierta:

1. Valida que la Oferta exista por `offerId`; si no, responde error **sin**
   redirigir (R11.3, R11.6).
2. Registra analítica **mínima**: `source` (de `?src=`) y `referrer_domain`
   (solo el dominio del `Referer`), sin IP completa ni fingerprinting.
3. Redirige (302) **únicamente** a `offer.affiliate_url` almacenada en la base de
   datos; jamás a un destino provisto por el cliente (R11.5).

Verificado por la Propiedad 17. Los botones externos se renderizan con
`rel="sponsored nofollow noopener"`.

## Modelo de seguridad de datos: RLS de Supabase (R8)

RLS habilitado en **todas** las tablas con datos sensibles (`offers`,
`telegram_updates`, `offer_clicks`, `offer_categories`, `admin_audit_logs`).
Tres roles: `anon` (Visitante Público), `authenticated` (Administrador) y el rol
de servicio (procesos de servidor) que **bypassa** RLS por diseño.

- **`offers`:** `anon` lee **solo** filas con `status = 'active'` (R8.2); no
  puede insertar, editar ni borrar (R8.3). El admin (`is_admin()`) lee y gestiona
  todo.
- **`offer_categories`:** lectura pública (catálogo no sensible).
- **`telegram_updates`, `admin_audit_logs`, `offer_clicks`:** sin acceso de
  lectura para `anon` (R8.4); solo el admin lee.
- **Denegación por defecto:** sin política aplicable, la operación se deniega.
  Así, intentos de escritura/lectura no autorizados se rechazan automáticamente.

La identidad de administrador para RLS se replica en una tabla
`admin_allowlist(email)` (poblada por el seed desde `ADMIN_EMAIL`, ya que
Postgres no lee variables de entorno) y una función `is_admin()`
`security definer` compara el claim `email` del JWT de Supabase Auth. Cubierto
por las pruebas de integración de RLS y por la Propiedad 22.

### Storage de imágenes (R3.5, R3.6)

Bucket `offer-images`: **lectura pública**, **escritura solo del servidor** (rol
de servicio). Política: `select` para `anon`/`public`; `insert`/`update`/`delete`
denegados a `anon`. Las URLs almacenadas son URLs públicas estables del bucket,
**nunca** URLs temporales de Telegram ni portadoras del Token del Bot.

## Autenticación y protección del panel admin (R10.4, R10.6, R23.1)

Defensa en profundidad de doble capa:

- **Enforcement primario — middleware + guard de servidor.** `middleware.ts`
  (con `@supabase/ssr`) refresca la sesión por cookies y protege `/admin/**` y
  `/api/admin/**`: si no hay sesión o el correo de la sesión **no** está en
  `ADMIN_EMAIL`, redirige a inicio de sesión (páginas) o responde 401/403 (APIs).
- **Respaldo — RLS.** Las políticas usan `is_admin()` como segunda capa. Las
  escrituras admin se ejecutan en endpoints de servidor verificados que usan el
  rol de servicio tras confirmar la sesión, y registran auditoría en
  `admin_audit_logs`.

Las rutas administrativas se excluyen de la navegación pública (R10.5).

## Endpoints expuestos a la red

Los endpoints públicos que mutan o ejecutan trabajo de servidor están
protegidos por un secreto/encabezado:

- **`/api/telegram/webhook`** — protegido por el `secret_token`
  (`TELEGRAM_WEBHOOK_SECRET`) comparado en tiempo constante; además la compuerta
  de Chat Autorizado y la validación Zod.
- **`/api/cron`** — protegido por `CRON_SECRET`; reintenta imágenes pendientes y
  expira ofertas vencidas.
- **`/admin/**` y `/api/admin/**`** — protegidos por Supabase Auth + allowlist
  `ADMIN_EMAIL` vía middleware.

No existe ningún otro endpoint **mutante no autenticado**: `/api/offers` y
`/api/offers/[id]` sirven solo lectura sujeta a RLS, y `/api/click/[offerId]`
es un redirector cerrado de solo lectura que ignora destinos del cliente.
