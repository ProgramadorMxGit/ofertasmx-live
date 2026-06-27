-- 0002_aux_tables.sql — Tablas auxiliares del dominio.
--
-- Tarea 8.2 del plan "Ofertas Reales IA".
-- Requisitos: R6.1 (esquema versionado de las 5 tablas), R6.9/R6.10
--             (`telegram_updates`), R6.11 (`offer_clicks` analítica mínima sin IP),
--             catálogo `offer_categories` y `admin_audit_logs` (R7.7, R8.6).
--
-- `offer_categories` no tiene dependencias de FK. `offer_clicks` y
-- `admin_audit_logs` referencian `public.offers`, que ya existe desde 0001.
-- La FK inversa `offers.category_id -> offer_categories(id)` se añade en 0003.

-- Catálogo de categorías (R4.14, R6.1). `slug` único: electronica, hogar, moda, ...
create table if not exists public.offer_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  sort_order  int not null default 0
);

-- Actualizaciones crudas de Telegram (R6.9, R6.10). `update_id` es la PK que
-- ancla la idempotencia del webhook (R1.12). `payload` se conserva solo el
-- tiempo necesario para depuración (R6.10).
create table if not exists public.telegram_updates (
  update_id         bigint primary key,
  message_id        bigint,
  chat_id           bigint,
  update_type       text,                              -- message | edited_message | channel_post | edited_channel_post
  payload           jsonb,
  processing_status text not null default 'received'
                    check (processing_status in
                      ('received', 'processed', 'duplicate', 'ignored', 'rejected', 'error')),
  error_message     text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz
);

-- Clics: analítica mínima (R6.11) — sin IP completa ni fingerprinting invasivo.
create table if not exists public.offer_clicks (
  id              uuid primary key default gen_random_uuid(),
  offer_id        uuid not null references public.offers(id) on delete cascade,
  source          text,                                -- ?src= (card | detail | featured ...)
  referrer_domain text,                                -- solo el dominio del Referer
  created_at      timestamptz not null default now()
);

-- Auditoría de acciones admin y de ediciones (R7.7, R8.6). Si la oferta se borra,
-- el registro de auditoría se conserva con `offer_id` nulo (on delete set null).
create table if not exists public.admin_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_email text,                                    -- admin que ejecutó la acción
  action      text not null,                           -- publish | hide | expire | edit | retry_image | ...
  offer_id    uuid references public.offers(id) on delete set null,
  details     jsonb,                                   -- diff antes/después (sin secretos)
  created_at  timestamptz not null default now()
);
