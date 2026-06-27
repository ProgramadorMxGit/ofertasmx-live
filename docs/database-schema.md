# Esquema de base de datos — Ofertas Reales IA

El esquema vive como SQL versionado bajo `supabase/migrations/` y es la **única
fuente de verdad**. Este documento refleja exactamente esas migraciones
(`0001`–`0005`). Complementa a [`docs/architecture.md`](architecture.md) y a
[`docs/telegram-integration.md`](telegram-integration.md).

Orden de migraciones:

| Archivo | Contenido |
|---------|-----------|
| `0001_init.sql` | Extensión `pgcrypto`, enums `offer_status` y `platform_t`, tabla `offers` |
| `0002_aux_tables.sql` | `offer_categories`, `telegram_updates`, `offer_clicks`, `admin_audit_logs` |
| `0003_indexes_triggers.sql` | Índices, unicidades, trigger `updated_at`, FK de categoría |
| `0004_rls.sql` | RLS, `admin_allowlist`, función `is_admin()`, políticas |
| `0005_storage.sql` | Bucket `offer-images` y su política de lectura pública |

## Extensiones y enums

- `pgcrypto` — habilita `gen_random_uuid()` para las claves primarias UUID.
- `offer_status` (enum): `draft`, `active`, `expired`, `hidden`, `rejected`,
  `needs_review`.
- `platform_t` (enum): `amazon`, `mercado_libre`.

## Tabla `offers`

Tabla central de ofertas. Además de los campos del dominio, incluye columnas de
soporte para el reintento de imagen del Cron (`image_status`,
`image_retry_count`, `image_last_attempt_at`) y la verificación del tag de
afiliado (`affiliate_tag`).

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `platform` | `platform_t` NOT NULL | `amazon` o `mercado_libre` |
| `merchant` | `text` NOT NULL | Nombre de la tienda |
| `external_product_id` | `text` | ASIN / MLM (nullable) |
| `fingerprint` | `text` NOT NULL | Huella normalizada para deduplicación |
| `telegram_chat_id` | `bigint` NOT NULL | Chat de origen |
| `telegram_message_id` | `bigint` NOT NULL | Mensaje de origen |
| `telegram_update_id` | `bigint` NOT NULL | Update de origen |
| `title` | `text` NOT NULL | Título de la oferta |
| `slug` | `text` NOT NULL | Slug único para la URL |
| `short_description` | `text` | Descripción corta (nullable) |
| `editorial_summary` | `text` | Resumen editorial (nullable) |
| `image_url` | `text` | URL estable (Storage o respaldo); nullable |
| `image_storage_path` | `text` | Ruta dentro del bucket; nullable |
| `image_alt` | `text` | Texto alternativo; nullable |
| `image_status` | `text` NOT NULL | `default 'ready'`; CHECK `in ('ready','pending','failed')` |
| `image_retry_count` | `int` NOT NULL | `default 0` |
| `image_last_attempt_at` | `timestamptz` | Último intento del Cron; nullable |
| `original_price` | `numeric(12,2)` | Precio anterior; nullable |
| `current_price` | `numeric(12,2)` NOT NULL | Precio actual |
| `discount_percent` | `int` | Nullable cuando no hay precio original |
| `currency` | `text` NOT NULL | `default 'MXN'` |
| `affiliate_url` | `text` | Enlace de afiliado; nullable salvo para `active` |
| `category_id` | `uuid` | FK a `offer_categories(id)` (añadida en `0003`) |
| `status` | `offer_status` NOT NULL | `default 'draft'` |
| `is_featured` | `boolean` NOT NULL | `default false` |
| `needs_review` | `boolean` NOT NULL | `default false` |
| `affiliate_tag` | `text` | Tag observado (Amazon) para verificación; nullable |
| `raw_text` | `text` | Texto original del mensaje; nullable |
| `published_at` | `timestamptz` | Fecha de publicación; nullable |
| `updated_at` | `timestamptz` NOT NULL | `default now()`; lo mantiene un trigger |
| `last_verified_at` | `timestamptz` | Última verificación; nullable |
| `expires_at` | `timestamptz` | **Nullable: una oferta sin `expires_at` no caduca por tiempo** |
| `created_at` | `timestamptz` NOT NULL | `default now()` |

### Restricciones (CHECK) de `offers`

- `offers_current_price_nonneg`: `current_price >= 0`.
- `offers_original_price_nonneg`: `original_price is null or original_price >= 0`.
- `offers_discount_percent_range`: `discount_percent is null or discount_percent between 0 and 100`.
- `active_requires_affiliate`: `status <> 'active' or affiliate_url is not null`
  (una oferta activa exige enlace de afiliado).
- `price_relationship`: `original_price is null or original_price > current_price`
  (si hay precio original, debe ser mayor que el actual).

> Nota de ordenamiento: en `0001`, `category_id` se declara como `uuid` **sin**
> clave foránea, porque `offer_categories` todavía no existe. La FK se agrega en
> `0003` una vez creada la tabla de categorías.

## Tabla `offer_categories`

Catálogo de categorías (no sensible).

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `slug` | `text` NOT NULL UNIQUE | `electronica`, `hogar`, `moda`, … |
| `name` | `text` NOT NULL | Nombre visible |
| `sort_order` | `int` NOT NULL | `default 0` |

## Tabla `telegram_updates`

Actualizaciones crudas de Telegram. `update_id` (PK) ancla la idempotencia del
webhook. El `payload` se conserva solo el tiempo necesario para depuración y para
que el Cron pueda recuperar las fotos en un reintento de imagen.

| Columna | Tipo | Notas |
|---------|------|-------|
| `update_id` | `bigint` PK | Idempotencia |
| `message_id` | `bigint` | Nullable |
| `chat_id` | `bigint` | Nullable |
| `update_type` | `text` | `message` / `edited_message` / `channel_post` / `edited_channel_post` |
| `payload` | `jsonb` | Update validado crudo |
| `processing_status` | `text` NOT NULL | `default 'received'`; CHECK `in ('received','processed','duplicate','ignored','rejected','error')` |
| `error_message` | `text` | Error técnico; nullable |
| `received_at` | `timestamptz` NOT NULL | `default now()` |
| `processed_at` | `timestamptz` | Nullable |

## Tabla `offer_clicks`

Analítica mínima de clics: **sin IP completa** ni fingerprinting invasivo.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `offer_id` | `uuid` NOT NULL | FK a `offers(id)` `on delete cascade` |
| `source` | `text` | Origen del clic (`?src=`: card, detail, featured…); nullable |
| `referrer_domain` | `text` | Solo el **dominio** del Referer; nullable |
| `created_at` | `timestamptz` NOT NULL | `default now()` |

## Tabla `admin_audit_logs`

Auditoría de acciones del administrador y de ediciones. Si la oferta se borra, el
registro se conserva con `offer_id` nulo.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `actor_email` | `text` | Admin que ejecutó la acción; nullable |
| `action` | `text` NOT NULL | `publish` / `hide` / `expire` / `edit` / `retry_image` / … |
| `offer_id` | `uuid` | FK a `offers(id)` `on delete set null` |
| `details` | `jsonb` | Diff antes/después (sin secretos); nullable |
| `created_at` | `timestamptz` NOT NULL | `default now()` |

## Tabla `admin_allowlist`

Replica a nivel de base de datos la allowlist de administradores (porque una
política RLS no puede leer variables de entorno). Se puebla en el despliegue a
partir de `ADMIN_EMAIL`.

| Columna | Tipo | Notas |
|---------|------|-------|
| `email` | `text` PK | Correo del administrador (en minúsculas) |

## Índices y unicidades (`0003`)

- `offers_slug_key` — índice **único** sobre `(slug)`.
- `offers_fingerprint_idx` — índice sobre `(fingerprint)` (resolución por huella).
- `offers_platform_extid_idx` — índice sobre `(platform, external_product_id)`
  (match por ASIN/MLM).
- `offers_chat_message_key` — índice **único** sobre
  `(telegram_chat_id, telegram_message_id)` (un mismo mensaje no genera dos ofertas).
- `offers_active_recent_idx` — índice **parcial** sobre
  `(published_at desc, id desc) where status = 'active'` (orden por recientes).
- `offers_active_discount_idx` — índice **parcial** sobre
  `(discount_percent desc) where status = 'active'` (orden por mayor descuento).

### Trigger `updated_at`

La función `public.set_updated_at()` fija `new.updated_at := now()` y el trigger
`offers_set_updated_at` la ejecuta `before update ... for each row` sobre
`offers`, de modo que cada actualización refresca `updated_at`.

### Clave foránea de categoría

`offers_category_id_fkey`: `offers.category_id → offer_categories(id)`
`on delete set null`. Se añade en `0003` (no en `0001`) porque
`offer_categories` se crea en `0002`. Si una categoría se elimina, el vínculo
queda nulo.

## Row Level Security (`0004`)

RLS habilitado en **todas** las tablas sensibles: `offers`, `telegram_updates`,
`offer_clicks`, `offer_categories`, `admin_audit_logs` y `admin_allowlist`.

Modelo de roles de Supabase:

- `anon` (Visitante Público) y `authenticated` (Administrador) quedan **sujetos a
  RLS**.
- El **rol de servicio** (`SUPABASE_SERVICE_ROLE_KEY`) **bypassa RLS** por diseño y
  es el único que escribe desde procesos de servidor.
- **Sin política aplicable, RLS deniega por defecto.**

> Compatibilidad de entorno: `0004` crea, **solo si faltan**, los roles
> `anon`/`authenticated`, el esquema `auth` y un equivalente de `auth.jwt()`. En
> Supabase ya existen, así que esos bloques no ejecutan nada; sirven para poder
> aplicar la migración en un PostgreSQL "vanilla" (como el de las pruebas de
> integración).

### Función `is_admin()`

```sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_allowlist
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
```

Compara, sin distinguir mayúsculas, el claim `email` del JWT contra
`admin_allowlist`. Es `security definer` para poder leer la allowlist aun con RLS
habilitado, y fija `search_path = public` para evitar inyección por search_path.

### Políticas por tabla

| Tabla | Política | Rol | Operación | Condición |
|-------|----------|-----|-----------|-----------|
| `offers` | `offers_public_read` | `anon` | SELECT | `status = 'active'` |
| `offers` | `offers_admin_all` | `authenticated` | ALL | `is_admin()` (using + with check) |
| `offer_categories` | `categories_public_read` | `anon` | SELECT | `true` (catálogo público) |
| `offer_categories` | `categories_admin_all` | `authenticated` | ALL | `is_admin()` |
| `telegram_updates` | `updates_admin_read` | `authenticated` | SELECT | `is_admin()` |
| `admin_audit_logs` | `audit_admin_read` | `authenticated` | SELECT | `is_admin()` |
| `offer_clicks` | `clicks_admin_read` | `authenticated` | SELECT | `is_admin()` |
| `admin_allowlist` | `allowlist_admin_read` | `authenticated` | SELECT | `is_admin()` |

Consecuencias de "denegado por defecto":

- El público **solo** lee ofertas `active`. No existe política de
  insert/update/delete para `anon` sobre `offers`, así que esas operaciones
  quedan **denegadas**.
- El público **no** puede leer `telegram_updates` (payloads), `admin_audit_logs`
  (auditoría), `offer_clicks` (analítica) ni `admin_allowlist`: no hay política de
  SELECT para `anon` en ninguna, por lo que se deniegan.
- La **inserción de un clic** la realiza el redirector con el rol de servicio
  (que bypassa RLS); el público no lee la analítica.
- Las **escrituras de administrador** se ejecutan en endpoints de servidor
  verificados que usan el rol de servicio tras confirmar la sesión; `is_admin()`
  actúa como respaldo de defensa en profundidad.

## Storage: bucket `offer-images` (`0005`)

- Bucket **público** `offer-images` (`public = true`): lectura por URL pública
  estable.
- Política `offer_images_public_read`: `select` para `anon` y `authenticated`
  donde `bucket_id = 'offer-images'`.
- **Sin** políticas de `insert`/`update`/`delete` para `anon` ⇒ escritura
  **denegada por defecto**. Las subidas las hace el Procesador de Imágenes con el
  rol de servicio (que bypassa RLS).
- Las URLs almacenadas son URLs públicas y estables del bucket, **nunca** URLs
  temporales de Telegram ni portadoras del token del bot.

> Compatibilidad: el esquema `storage` y `storage.objects` solo existen en
> Supabase, así que `0005` envuelve todo en un bloque guardado que no hace nada si
> falta `storage`. En algunos proyectos conviene además crear el bucket desde el
> dashboard; la migración deja la política como fuente de verdad reproducible.

## Datos de demostración (`seed.sql`)

`supabase/seed.sql` inserta categorías y ocho ofertas demo **claramente
ficticias** (marcas y precios inventados, títulos con sufijo "(demo)") que cubren
todos los estados: activa, recién publicada, destacada, sin precio original,
expirada, `needs_review` y una sin imagen, en Amazon y Mercado Libre. Es
idempotente (`on conflict`).

El seed **no** inserta un correo en `admin_allowlist` (el SQL crudo no lee
variables de entorno, y se evita crear un administrador placeholder). Sincroniza
esa tabla con `ADMIN_EMAIL` en el despliegue, por ejemplo:

- `psql` con variable: `psql "$DATABASE_URL" -v admin_email='tu@correo.com' -f supabase/seed.sql`
  (descomentando el `insert` previsto en el archivo), o
- un script de seed en Node que lee `process.env.ADMIN_EMAIL` (uno o varios
  correos separados por coma), los normaliza a minúsculas e inserta cada uno con
  `on conflict (email) do nothing` usando el rol de servicio.
