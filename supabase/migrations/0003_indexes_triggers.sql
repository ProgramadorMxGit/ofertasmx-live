-- 0003_indexes_triggers.sql — Índices, unicidad, trigger de `updated_at` y FK de categoría.
--
-- Tarea 8.3 del plan "Ofertas Reales IA".
-- Requisitos: R6.4 (slug único), R6.5 (índices de fingerprint y (platform, external_product_id)),
--             R6.6 (unicidad de message_id dentro del Chat Autorizado),
--             R6.12 (expires_at nullable, ya en 0001) y rendimiento de consulta pública (R19.6).
--
-- Todas las sentencias son idempotent-friendly: `create index if not exists`,
-- `create or replace function`, `drop trigger if exists` antes de crearlo y la FK
-- protegida contra duplicados.

-- Unicidad del slug (R6.4).
create unique index if not exists offers_slug_key
  on public.offers (slug);

-- Índice de fingerprint (R6.5) — resolución de duplicados por huella.
create index if not exists offers_fingerprint_idx
  on public.offers (fingerprint);

-- Índice por (platform, external_product_id) (R6.5) — match por ASIN/MLM.
create index if not exists offers_platform_extid_idx
  on public.offers (platform, external_product_id);

-- Unicidad de message_id dentro del Chat Autorizado (R6.6): índice único
-- compuesto (telegram_chat_id, telegram_message_id). Garantiza que un mismo
-- mensaje no genere dos ofertas.
create unique index if not exists offers_chat_message_key
  on public.offers (telegram_chat_id, telegram_message_id);

-- Índices parciales de consulta pública (rendimiento, R19.6): solo ofertas activas.
-- Orden por recientes (published_at desc, id desc como desempate estable de keyset).
create index if not exists offers_active_recent_idx
  on public.offers (published_at desc, id desc)
  where status = 'active';

-- Orden por mayor descuento.
create index if not exists offers_active_discount_idx
  on public.offers (discount_percent desc)
  where status = 'active';

-- Trigger de `updated_at`: fija `updated_at = now()` en cada UPDATE de `offers`.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at
  before update on public.offers
  for each row
  execute function public.set_updated_at();

-- FK de categoría: offers.category_id -> offer_categories(id). Se agrega aquí
-- (no en 0001) porque `offer_categories` se crea en 0002. Si la oferta apunta a
-- una categoría que se elimina, el vínculo queda nulo (on delete set null).
do $$
begin
  alter table public.offers
    add constraint offers_category_id_fkey
    foreign key (category_id) references public.offer_categories(id)
    on delete set null;
exception
  when duplicate_object then null;
end
$$;
