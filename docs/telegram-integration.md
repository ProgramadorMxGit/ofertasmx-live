# Integración con Telegram — Ofertas Reales IA

Documenta el endpoint del webhook, sus garantías de seguridad, el procesamiento
de actualizaciones, el pipeline de imágenes, el script de registro y el Cron de
mantenimiento. Complementa a [`docs/architecture.md`](architecture.md) y a
[`docs/database-schema.md`](database-schema.md).

> Token comprometido: si el `TELEGRAM_BOT_TOKEN` se expuso alguna vez (en Git, en
> logs, etc.), debe considerarse **comprometido**. Revócalo de inmediato con
> [@BotFather](https://t.me/BotFather) y genera uno nuevo. El token nuevo va
> **solo** en `.env.local` (desarrollo) y en las variables de entorno de Vercel
> (producción): nunca en `.env.example`, en el código ni en ningún archivo
> versionado. Tras rotarlo, vuelve a registrar el webhook.

## Endpoint `/api/telegram/webhook`

Runtime **Node.js** (no Edge): necesita `crypto.timingSafeEqual` para la
comparación en tiempo constante y la pila de `sharp`/rol de servicio detrás del
procesamiento. Solo se exporta `POST`.

Las guardas se ejecutan en orden estricto; cada una corta antes de la siguiente:

| Orden | Guarda | Resultado si falla |
|-------|--------|--------------------|
| 1 | **Método**: solo `POST` | `405` (la maneja el framework, sin ejecutar el handler ni leer el cuerpo) |
| 2 | **Secreto en tiempo constante**: header `X-Telegram-Bot-Api-Secret-Token` vs `TELEGRAM_WEBHOOK_SECRET` | `401` (el cuerpo nunca se lee) |
| 3 | **Tamaño del cuerpo**: límite de 1 000 000 bytes | `413` (antes de parsear) |
| 4 | **Esquema Zod** del update | `400` + log técnico (rutas/códigos de las incidencias, sin datos personales) |
| 5 | **Compuerta de chat**: `chat.id === 5054325626` | otros chats se ignoran en silencio y responden `200` |
| 6 | **Idempotencia + procesamiento + ack** | `200` rápido en toda salida manejada; `500` solo ante fallo interno real |

Detalles:

- **Tamaño:** se comprueba primero el `content-length` anunciado y, tras leer, el
  tamaño real en bytes, para que un header ausente o mentiroso no eluda el límite.
- **Comparación de secreto:** se hace sobre buffers; longitudes distintas ⇒
  `false`. El secreto nunca se registra.
- **Fallo interno (`500`):** solo cuando un puerto lanza una excepción real (p. ej.
  la base de datos no responde). Como la idempotencia se ancla en `update_id`, el
  reintento de Telegram tras un `5xx` no duplica efectos.
- **Sin secretos en logs:** el logger se inicializa con los valores protegidos y
  los enmascara en cualquier mensaje.

## Tipos de actualización reconocidos

El esquema Zod reconoce los cuatro tipos y extrae sus campos:

- `message`
- `edited_message`
- `channel_post`
- `edited_channel_post`

Un update sin un mensaje reconocible se ignora (salida `ignored`, motivo
`unsupported_update`).

## Extracción de campos

De cada mensaje se extraen, entre otros: `update_id`, `message_id`, `chat.id`,
`date`, `edit_date` (cuando aplica), `text` y/o `caption`, las `photo` (con
`file_id`, `file_unique_id`, dimensiones y tamaño) y las entidades
(`entities`/`caption_entities`). El parser (`lib/parser`) opera sobre `text`
y/o `caption` para derivar título, precios (con `decimal.js`), descuento,
plataforma/comercio y categoría. Si no hay un enlace de comercio permitido o el
precio no es coherente, el update se marca `rejected` (la columna
`offers.platform` es `NOT NULL` y una oferta no puede publicarse sin
`affiliate_url`).

## Procesamiento idempotente (`lib/telegram/ingest.ts`)

Tras las guardas de transporte, `ingestUpdate` ejecuta el pipeline. Toda
operación efectiva se inyecta como **puerto**, de modo que se prueba con mocks en
memoria.

1. **Compuerta de chat.** Solo se procesa `chat.id === authorizedChatId`
   (`TELEGRAM_ALLOWED_CHAT_ID`). Cualquier otro chat (o un update sin mensaje
   reconocido) se ignora **sin persistir el payload**; solo se registra un evento
   técnico, sin datos personales.
2. **Reclamo idempotente.** `INSERT ... ON CONFLICT (update_id) DO NOTHING` en
   `telegram_updates`. Si la fila ya existe en estado **terminal** (`processed`,
   `duplicate`, `ignored`, `rejected`), es un duplicado y **no** se reprocesa. Si
   existe en `received`/`error` (p. ej. un reintento de Telegram tras un `5xx`),
   el procesamiento se reanuda con seguridad. El payload validado se guarda para
   que el Cron pueda recuperar las fotos en un reintento de imagen.
3. **Parseo.** Si el precio se rechaza o no hay enlace de comercio permitido, el
   update se marca `rejected` y termina.
4. **Identidad y deduplicación.** Se calcula el `fingerprint` y se resuelven
   duplicados por orden de prioridad (plataforma + id externo, ASIN, MLM,
   `message_id`, fingerprint).
5. **Persistencia.**
   - **Actualización:** si hay coincidencia, se parchea precio/descuento/fechas
     conservando `slug` e imagen, y se emite un evento `UPDATE` por Realtime. Para
     un `edited_message` se escribe además una entrada en `admin_audit_logs`.
   - **Inserción:** se procesa la imagen dentro del presupuesto de tiempo (ver
     abajo) y se inserta la oferta; se emite `INSERT` por Realtime.

Toda salida (`ignored`, `duplicate`, `rejected`, `inserted`, `updated`) mapea a un
`200` rápido.

## Pipeline de imagen (`lib/telegram/images.ts`)

Cada paso efectivo se inyecta para poder probar sin bot, red ni `sharp` reales:

1. **Selección y descarga.** Se elige la mejor foto y se descarga del lado del
   servidor con `getFile` (ligado al `TELEGRAM_BOT_TOKEN`).
2. **Análisis.** Un analizador tipo `sharp` lee el formato y las dimensiones a
   partir de los **bytes reales** (no del MIME declarado), de modo que un MIME
   falsificado no puede dictar el nombre del archivo.
3. **Validación** (`validateImage`). Se acepta **solo si** el MIME declarado está
   permitido (`image/jpeg`, `image/png`, `image/webp`), el tamaño es positivo y no
   supera 5 000 000 bytes, el formato real mapea a una extensión permitida
   (`jpg`/`png`/`webp`) y —cuando se conocen— las dimensiones están dentro de
   rango (50–6000 px). En caso contrario se devuelve el primer motivo de rechazo
   (`empty`, `too_large`, `mime_not_allowed`, `extension_not_allowed`,
   `dimensions_out_of_range`).
4. **Subida.** Se genera un nombre seguro `<uuid>.<ext>` y se sube al bucket
   `offer-images` con el rol de servicio.
5. **URL estable.** Se devuelve la **URL pública estable** del Storage de Supabase
   más la ruta de almacenamiento.

**Respaldo y reintento.** Ante cualquier fallo (sin foto, descarga, análisis,
validación o subida) el procesador degrada a un resultado de respaldo: imagen de
fallback local (`/fallback-offer.svg`), `image_status` marcado para reintento y
un `reason` legible por máquina. Así la oferta **igual se guarda** y el Cron puede
reintentar más tarde. El `imageUrl` devuelto es **siempre** una URL de Storage o
la de respaldo: **nunca** una URL temporal de Telegram portadora del token
(`R3.6`). En la inserción del webhook, una imagen lenta o fallida se guarda con
`image_status = 'pending'`.

## Script de registro (`scripts/register-telegram-webhook.ts`)

CLI (no endpoint público), por lo que no hay forma desprotegida de registrar o
borrar el webhook. Lee el token **solo** de `TELEGRAM_BOT_TOKEN`; si falta, aborta
con un error claro **antes** de cualquier llamada de red.

```bash
npx tsx scripts/register-telegram-webhook.ts set      # configurar el webhook
npx tsx scripts/register-telegram-webhook.ts status   # ver getWebhookInfo
```

- **`set`** llama a `setWebhook` con la URL
  `${NEXT_PUBLIC_SITE_URL}/api/telegram/webhook`, el `secret_token`
  (`TELEGRAM_WEBHOOK_SECRET`) y `allowed_updates = [message, edited_message,
  channel_post, edited_channel_post]` (solo lo necesario).
- **`status`** llama a `getWebhookInfo` y muestra la URL configurada, el número de
  actualizaciones pendientes y el último error.

**Seguridad de salida:** el token y el `secret_token` se usan solo para construir
la URL/cuerpo de la petición en memoria; **nunca** se imprimen. El secreto se
muestra como "(configured, hidden)" y, como defensa adicional, toda línea emitida
pasa por un enmascarado que oculta esos valores aunque se cuelen.

Como es un proceso Node independiente, las variables de entorno deben estar
presentes en el shell (`tsx` no carga `.env.local` automáticamente). Ver §9 del
[`README.md`](../README.md).

## Cron de mantenimiento (`/api/cron`)

Runtime **Node.js**. Declarado en `vercel.json` con `schedule: */5 * * * *` (cada
5 minutos). Protegido por `CRON_SECRET`: Vercel Cron envía
`Authorization: Bearer <CRON_SECRET>` automáticamente cuando la variable está
configurada, y la ruta lo compara en **tiempo constante**; cualquier
discrepancia (o una llamada manual sin autenticar) responde `401`. Acepta `GET`
(que dispara Vercel) y `POST`. El secreto nunca se registra.

Cada ejecución corre dos trabajos (`lib/telegram/cron.ts`):

1. **Reintento de imágenes con backoff.** Toma ofertas con `image_status` en
   (`pending`, `failed`), hasta un límite por lote (25 por defecto), y reintenta
   las que estén "vencidas" según un **backoff exponencial**:
   `min(base * 2^retryCount, max)` con base de 5 minutos y tope de 6 horas. Una
   oferta nunca antes intentada siempre está lista. Se deja de reintentar tras 8
   intentos. En éxito, la oferta se marca `ready` con la URL/ruta estables de
   Storage; en fallo, se incrementan `image_retry_count` y `image_last_attempt_at`
   para que el backoff crezca.
2. **Expiración.** Marca `expired` las ofertas que son `active`, tienen
   `expires_at` **no nulo** y cuyo `expires_at <= now`. Las ofertas con
   `expires_at` **nulo nunca** se expiran por tiempo. Los `UPDATE` resultantes se
   propagan a los clientes por Supabase Realtime automáticamente.

Los reintentos de imagen corren antes que la expiración, para que una oferta
recién recuperada no se considere simultáneamente para expirar. La respuesta
resume el trabajo (intentadas, recuperadas, fallidas, omitidas, expiradas) sin
exponer secretos.
