-- 0001_init.sql — Esquema base: extensión, enums y tabla `offers`.
--
-- Tarea 8.1 del plan "Ofertas Reales IA".
-- Requisitos: R6.2 (campos de `offers`), R6.3 (enum de `status`),
--             R6.7 (CHECKs de precio/descuento), R6.8 (oferta activa exige `affiliate_url`).
--
-- Estas migraciones son la ÚNICA fuente de verdad del esquema (R6.1). El orden es:
--   0001_init.sql            -> extensión + enums + tabla `offers`        (esta tarea, 8.1)
--   0002_aux_tables.sql      -> offer_categories, telegram_updates,
--                               offer_clicks, admin_audit_logs            (8.2)
--   0003_indexes_triggers.sql-> índices, unicidad, trigger updated_at,
--                               y FK offers.category_id -> offer_categories(8.3)
--
-- Nota de ordenamiento: `offers.category_id` se declara aquí como columna `uuid`
-- SIN clave foránea, porque `offer_categories` aún no existe en 0001. La FK se
-- agrega en 0003 (tarea 8.3) una vez creada la tabla de categorías. Las sentencias
-- son idempotent-friendly (extensión `if not exists`, enums protegidos contra
-- duplicados, tablas `if not exists`) para poder reaplicar la migración sin error.

create extension if not exists "pgcrypto";          -- gen_random_uuid()

-- Enum de estado de oferta (R6.3). `create type` no admite `if not exists`,
-- por eso se protege con un bloque que ignora la creación duplicada.
do $$
begin
  create type offer_status as enum
    ('draft', 'active', 'expired', 'hidden', 'rejected', 'needs_review');
exception
  when duplicate_object then null;
end
$$;

-- Enum de plataforma de origen.
do $$
begin
  create type platform_t as enum ('amazon', 'mercado_libre');
exception
  when duplicate_object then null;
end
$$;

-- Tabla de ofertas (R6.2). Incluye, además de los campos exigidos por R6.2, las
-- columnas de soporte del reintento de imagen del Cron (`image_status`,
-- `image_retry_count`, `image_last_attempt_at`, R3.8) y la verificación del tag
-- de afiliado (`affiliate_tag`, R5.7/R5.8). R6.2 pide "al menos" esos campos.
create table if not exists public.offers (
  id                    uuid primary key default gen_random_uuid(),
  platform              platform_t not null,
  merchant              text not null,
  external_product_id   text,                          -- ASIN / MLM (nullable)
  fingerprint           text not null,                 -- huella normalizada (R7.2)
  telegram_chat_id      bigint not null,
  telegram_message_id   bigint not null,
  telegram_update_id    bigint not null,
  title                 text not null,
  slug                  text not null,
  short_description     text,
  editorial_summary     text,
  image_url             text,                          -- URL estable (Storage o fallback)
  image_storage_path    text,
  image_alt             text,
  image_status          text not null default 'ready'  -- ready | pending | failed (R3.8)
                        check (image_status in ('ready', 'pending', 'failed')),
  image_retry_count     int not null default 0,
  image_last_attempt_at timestamptz,
  original_price        numeric(12, 2),                -- nullable: oferta sin precio original (R4.12)
  current_price         numeric(12, 2) not null,
  discount_percent      int,                           -- nullable cuando no hay precio original
  currency              text not null default 'MXN',
  affiliate_url         text,
  category_id           uuid,                          -- FK a offer_categories añadida en 0003 (8.3)
  status                offer_status not null default 'draft',
  is_featured           boolean not null default false,
  needs_review          boolean not null default false,
  affiliate_tag         text,                          -- tag observado (Amazon) para verificación (R5.7)
  raw_text              text,
  published_at          timestamptz,
  updated_at            timestamptz not null default now(),
  last_verified_at      timestamptz,
  expires_at            timestamptz,                   -- nullable: no caduca por tiempo (R6.12, R9.9)
  created_at            timestamptz not null default now(),

  -- Restricciones de precio y descuento (R6.7).
  constraint offers_current_price_nonneg
    check (current_price >= 0),
  constraint offers_original_price_nonneg
    check (original_price is null or original_price >= 0),
  constraint offers_discount_percent_range
    check (discount_percent is null or discount_percent between 0 and 100),

  -- Una oferta activa exige `affiliate_url` (R6.8).
  constraint active_requires_affiliate
    check (status <> 'active' or affiliate_url is not null),

  -- Coherencia de precios (R4.11): si hay original, debe ser > current.
  constraint price_relationship
    check (original_price is null or original_price > current_price)
);
