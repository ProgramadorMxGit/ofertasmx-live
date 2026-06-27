-- seed.sql — Datos de demostración claramente ficticios (Tarea 11, R24).
--
-- Requisitos:
--   R24.1  Seeds visuales con productos ficticios / claramente marcados como demo.
--   R24.2  Sin marcas ni precios reales presentados como vigentes de forma engañosa.
--   R24.3  Cubrir TODOS los estados: activa, recién publicada, destacada, sin
--          precio original, expirada y `needs_review`; además Amazon, Mercado
--          Libre y una oferta SIN imagen.
--
-- Honestidad (principio rector): todas las marcas y precios son INVENTADOS
-- ("DemoTech", "MarcaEjemplo", "AcmeDemo", ...) y los títulos llevan el sufijo
-- "(demo)". Nada aquí representa un producto, marca o precio real vigente
-- (R24.2). Los enlaces apuntan a rutas de demostración en los dominios reales
-- (amazon.com.mx / mercadolibre.com.mx) con identificadores ficticios.
--
-- Determinismo: los `id` de categorías y ofertas son UUID fijos y los `slug`
-- llevan prefijo `demo-`, de modo que el seed es reproducible e idempotente
-- (`on conflict`). Las marcas de tiempo son relativas a `now()` para que la
-- demo siempre luzca "en vivo".
--
-- Restricciones del esquema respetadas (0001_init.sql):
--   current_price >= 0; original_price null o >= 0; discount 0..100;
--   active_requires_affiliate (status='active' => affiliate_url not null);
--   price_relationship (original_price null o original_price > current_price);
--   slug único; (telegram_chat_id, telegram_message_id) único.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- Catálogo de categorías (R4.14). 8 categorías con nombre visible y orden.
-- Idempotente: refresca nombre/orden si ya existen (por `slug` único).
-- ───────────────────────────────────────────────────────────────────────────
insert into public.offer_categories (id, slug, name, sort_order) values
  ('ca700000-0000-4000-8000-000000000001', 'electronica',  'Electrónica',  1),
  ('ca700000-0000-4000-8000-000000000002', 'hogar',         'Hogar',        2),
  ('ca700000-0000-4000-8000-000000000003', 'moda',          'Moda',         3),
  ('ca700000-0000-4000-8000-000000000004', 'herramientas',  'Herramientas', 4),
  ('ca700000-0000-4000-8000-000000000005', 'oficina',       'Oficina',      5),
  ('ca700000-0000-4000-8000-000000000006', 'belleza',       'Belleza',      6),
  ('ca700000-0000-4000-8000-000000000007', 'deportes',      'Deportes',     7),
  ('ca700000-0000-4000-8000-000000000008', 'otros',         'Otros',        8)
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order;

-- ───────────────────────────────────────────────────────────────────────────
-- Ofertas de demostración. Cada fila documenta qué estado(s) de R24.3 cubre.
-- `category_id` se resuelve por `slug` (robusto ante cambios de id).
-- Idempotente: `on conflict (id) do nothing` (re-seed = solo altas faltantes).
-- ───────────────────────────────────────────────────────────────────────────

-- O1 — ACTIVA + AMAZON + DESTACADA + imagen lista + expira en el futuro.
insert into public.offers (
  id, platform, merchant, external_product_id, fingerprint,
  telegram_chat_id, telegram_message_id, telegram_update_id,
  title, slug, short_description, editorial_summary,
  image_url, image_storage_path, image_alt, image_status,
  original_price, current_price, discount_percent, currency,
  affiliate_url, affiliate_tag, category_id, status,
  is_featured, needs_review, raw_text,
  published_at, last_verified_at, expires_at
) values (
  'de700000-0000-4000-8000-000000000001', 'amazon', 'Amazon México', 'B0DEMO0001',
  'demo-fingerprint-0001',
  5054325626, 1001, 2001,
  'Audífonos inalámbricos DemoTech Pulse 300 (demo)',
  'demo-audifonos-demotech-pulse-300',
  'Audífonos de demostración con cancelación de ruido ficticia.',
  'Resumen editorial de demostración: producto ficticio para previsualizar el diseño.',
  '/demo/offer-01.png', null, 'Audífonos DemoTech Pulse 300 (imagen de demostración)', 'ready',
  2499.00, 1799.00, 28, 'MXN',
  'https://www.amazon.com.mx/dp/B0DEMO0001?tag=programadormx-20', 'programadormx-20',
  (select id from public.offer_categories where slug = 'electronica'), 'active',
  true, false, 'DEMO: Audífonos DemoTech Pulse 300 https://www.amazon.com.mx/dp/B0DEMO0001',
  now() - interval '2 hours', now() - interval '25 minutes', now() + interval '3 days'
)
on conflict (id) do nothing;

-- O2 — ACTIVA + MERCADO LIBRE + RECIÉN PUBLICADA (published_at muy reciente).
insert into public.offers (
  id, platform, merchant, external_product_id, fingerprint,
  telegram_chat_id, telegram_message_id, telegram_update_id,
  title, slug, short_description, editorial_summary,
  image_url, image_storage_path, image_alt, image_status,
  original_price, current_price, discount_percent, currency,
  affiliate_url, affiliate_tag, category_id, status,
  is_featured, needs_review, raw_text,
  published_at, last_verified_at, expires_at
) values (
  'de700000-0000-4000-8000-000000000002', 'mercado_libre', 'Mercado Libre', 'MLM1000002',
  'demo-fingerprint-0002',
  5054325626, 1002, 2002,
  'Licuadora MarcaEjemplo TurboMix 1.5L (demo)',
  'demo-licuadora-marcaejemplo-turbomix-15l',
  'Licuadora de demostración con vaso ficticio de 1.5 L.',
  'Resumen editorial de demostración para una oferta recién publicada.',
  '/demo/offer-02.png', null, 'Licuadora MarcaEjemplo TurboMix (imagen de demostración)', 'ready',
  899.00, 599.00, 33, 'MXN',
  'https://www.mercadolibre.com.mx/p/MLM1000002-demo', null,
  (select id from public.offer_categories where slug = 'hogar'), 'active',
  false, false, 'DEMO: Licuadora TurboMix https://www.mercadolibre.com.mx/p/MLM1000002-demo',
  now() - interval '8 minutes', now() - interval '8 minutes', null
)
on conflict (id) do nothing;

-- O3 — ACTIVA + AMAZON + SIN PRECIO ORIGINAL (original_price null, discount null).
insert into public.offers (
  id, platform, merchant, external_product_id, fingerprint,
  telegram_chat_id, telegram_message_id, telegram_update_id,
  title, slug, short_description, editorial_summary,
  image_url, image_storage_path, image_alt, image_status,
  original_price, current_price, discount_percent, currency,
  affiliate_url, affiliate_tag, category_id, status,
  is_featured, needs_review, raw_text,
  published_at, last_verified_at, expires_at
) values (
  'de700000-0000-4000-8000-000000000003', 'amazon', 'Amazon México', 'B0DEMO0003',
  'demo-fingerprint-0003',
  5054325626, 1003, 2003,
  'Tenis urbanos MarcaEjemplo Street One (demo)',
  'demo-tenis-marcaejemplo-street-one',
  'Tenis de demostración sin precio anterior conocido.',
  null,
  '/demo/offer-03.png', null, 'Tenis MarcaEjemplo Street One (imagen de demostración)', 'ready',
  null, 1299.00, null, 'MXN',
  'https://www.amazon.com.mx/dp/B0DEMO0003?tag=programadormx-20', 'programadormx-20',
  (select id from public.offer_categories where slug = 'moda'), 'active',
  false, false, 'DEMO: Tenis Street One https://www.amazon.com.mx/dp/B0DEMO0003',
  now() - interval '5 hours', now() - interval '40 minutes', null
)
on conflict (id) do nothing;

-- O4 — ACTIVA + MERCADO LIBRE + SIN IMAGEN (image_url null, image_status 'failed').
insert into public.offers (
  id, platform, merchant, external_product_id, fingerprint,
  telegram_chat_id, telegram_message_id, telegram_update_id,
  title, slug, short_description, editorial_summary,
  image_url, image_storage_path, image_alt, image_status,
  image_retry_count, image_last_attempt_at,
  original_price, current_price, discount_percent, currency,
  affiliate_url, affiliate_tag, category_id, status,
  is_featured, needs_review, raw_text,
  published_at, last_verified_at, expires_at
) values (
  'de700000-0000-4000-8000-000000000004', 'mercado_libre', 'Mercado Libre', 'MLM1000004',
  'demo-fingerprint-0004',
  5054325626, 1004, 2004,
  'Taladro inalámbrico AcmeDemo Drill 20V (demo)',
  'demo-taladro-acmedemo-drill-20v',
  'Taladro de demostración cuya imagen falló al descargarse (fallback).',
  null,
  null, null, null, 'failed',
  2, now() - interval '15 minutes',
  1599.00, 1199.00, 25, 'MXN',
  'https://www.mercadolibre.com.mx/p/MLM1000004-demo', null,
  (select id from public.offer_categories where slug = 'herramientas'), 'active',
  false, false, 'DEMO: Taladro Drill 20V https://www.mercadolibre.com.mx/p/MLM1000004-demo',
  now() - interval '1 day', now() - interval '2 hours', null
)
on conflict (id) do nothing;

-- O5 — EXPIRADA + AMAZON (status 'expired', expires_at en el pasado).
insert into public.offers (
  id, platform, merchant, external_product_id, fingerprint,
  telegram_chat_id, telegram_message_id, telegram_update_id,
  title, slug, short_description, editorial_summary,
  image_url, image_storage_path, image_alt, image_status,
  original_price, current_price, discount_percent, currency,
  affiliate_url, affiliate_tag, category_id, status,
  is_featured, needs_review, raw_text,
  published_at, last_verified_at, expires_at
) values (
  'de700000-0000-4000-8000-000000000005', 'amazon', 'Amazon México', 'B0DEMO0005',
  'demo-fingerprint-0005',
  5054325626, 1005, 2005,
  'Smart TV DemoVision 50" 4K (demo)',
  'demo-smart-tv-demovision-50-4k',
  'Televisor de demostración cuya oferta ya expiró.',
  'Resumen editorial de demostración para una oferta expirada.',
  '/demo/offer-05.png', null, 'Smart TV DemoVision 50 pulgadas (imagen de demostración)', 'ready',
  9999.00, 6999.00, 30, 'MXN',
  'https://www.amazon.com.mx/dp/B0DEMO0005?tag=programadormx-20', 'programadormx-20',
  (select id from public.offer_categories where slug = 'electronica'), 'expired',
  false, false, 'DEMO: Smart TV DemoVision https://www.amazon.com.mx/dp/B0DEMO0005',
  now() - interval '6 days', now() - interval '2 days', now() - interval '1 day'
)
on conflict (id) do nothing;

-- O6 — NEEDS_REVIEW + MERCADO LIBRE (descuento escrito no coincide con el real).
insert into public.offers (
  id, platform, merchant, external_product_id, fingerprint,
  telegram_chat_id, telegram_message_id, telegram_update_id,
  title, slug, short_description, editorial_summary,
  image_url, image_storage_path, image_alt, image_status,
  original_price, current_price, discount_percent, currency,
  affiliate_url, affiliate_tag, category_id, status,
  is_featured, needs_review, raw_text,
  published_at, last_verified_at, expires_at
) values (
  'de700000-0000-4000-8000-000000000006', 'mercado_libre', 'Mercado Libre', 'MLM1000006',
  'demo-fingerprint-0006',
  5054325626, 1006, 2006,
  'Set de brochas BellaDemo Glow x12 (demo)',
  'demo-set-brochas-bellademo-glow-x12',
  'Set de demostración marcado para revisión por descuento inconsistente.',
  null,
  '/demo/offer-06.png', null, 'Set de brochas BellaDemo Glow (imagen de demostración)', 'ready',
  1000.00, 750.00, 25, 'MXN',
  'https://www.mercadolibre.com.mx/p/MLM1000006-demo', null,
  (select id from public.offer_categories where slug = 'belleza'), 'needs_review',
  false, true, 'DEMO: Brochas Glow -40% https://www.mercadolibre.com.mx/p/MLM1000006-demo',
  now() - interval '3 hours', now() - interval '3 hours', null
)
on conflict (id) do nothing;

-- O7 — ACTIVA + MERCADO LIBRE + DESTACADA (segunda destacada, variedad).
insert into public.offers (
  id, platform, merchant, external_product_id, fingerprint,
  telegram_chat_id, telegram_message_id, telegram_update_id,
  title, slug, short_description, editorial_summary,
  image_url, image_storage_path, image_alt, image_status,
  original_price, current_price, discount_percent, currency,
  affiliate_url, affiliate_tag, category_id, status,
  is_featured, needs_review, raw_text,
  published_at, last_verified_at, expires_at
) values (
  'de700000-0000-4000-8000-000000000007', 'mercado_libre', 'Mercado Libre', 'MLM1000007',
  'demo-fingerprint-0007',
  5054325626, 1007, 2007,
  'Bicicleta fija DemoFit Ride Pro (demo)',
  'demo-bicicleta-fija-demofit-ride-pro',
  'Bicicleta fija de demostración para la cuadrícula de destacados.',
  'Resumen editorial de demostración para una oferta destacada.',
  '/demo/offer-07.png', null, 'Bicicleta fija DemoFit Ride Pro (imagen de demostración)', 'ready',
  3299.00, 2199.00, 33, 'MXN',
  'https://www.mercadolibre.com.mx/p/MLM1000007-demo', null,
  (select id from public.offer_categories where slug = 'deportes'), 'active',
  true, false, 'DEMO: Bici fija Ride Pro https://www.mercadolibre.com.mx/p/MLM1000007-demo',
  now() - interval '20 hours', now() - interval '50 minutes', null
)
on conflict (id) do nothing;

-- O8 — ACTIVA + AMAZON (oferta común, no destacada) para poblar el listado.
insert into public.offers (
  id, platform, merchant, external_product_id, fingerprint,
  telegram_chat_id, telegram_message_id, telegram_update_id,
  title, slug, short_description, editorial_summary,
  image_url, image_storage_path, image_alt, image_status,
  original_price, current_price, discount_percent, currency,
  affiliate_url, affiliate_tag, category_id, status,
  is_featured, needs_review, raw_text,
  published_at, last_verified_at, expires_at
) values (
  'de700000-0000-4000-8000-000000000008', 'amazon', 'Amazon México', 'B0DEMO0008',
  'demo-fingerprint-0008',
  5054325626, 1008, 2008,
  'Lámpara de escritorio DemoLux Focus LED (demo)',
  'demo-lampara-escritorio-demolux-focus-led',
  'Lámpara de demostración con brazo articulado ficticio.',
  null,
  '/demo/offer-08.png', null, 'Lámpara de escritorio DemoLux Focus LED (imagen de demostración)', 'ready',
  599.00, 449.00, 25, 'MXN',
  'https://www.amazon.com.mx/dp/B0DEMO0008?tag=programadormx-20', 'programadormx-20',
  (select id from public.offer_categories where slug = 'oficina'), 'active',
  false, false, 'DEMO: Lámpara DemoLux Focus https://www.amazon.com.mx/dp/B0DEMO0008',
  now() - interval '30 hours', now() - interval '90 minutes', null
)
on conflict (id) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- admin_allowlist — poblar desde ADMIN_EMAIL EN EL DESPLIEGUE (R8.6, R10.6).
-- ───────────────────────────────────────────────────────────────────────────
-- SQL crudo NO lee variables de entorno, así que este seed NO inserta un correo
-- fijo (evita crear un administrador falso/placeholder). La allowlist debe
-- mantenerse sincronizada con `ADMIN_EMAIL` por el paso de despliegue. Opciones:
--
--   (a) psql con variable (descomenta el INSERT y pasa -v admin_email=...):
--         psql "$DATABASE_URL" -v admin_email='tu@correo.com' -f supabase/seed.sql
--       -- insert into public.admin_allowlist (email)
--       -- values (lower(:'admin_email'))
--       -- on conflict (email) do nothing;
--
--   (b) script de seed en Node que lee process.env.ADMIN_EMAIL (uno o varios
--       correos separados por coma), normaliza a minúsculas e inserta cada uno
--       con `on conflict (email) do nothing` usando el rol de servicio.
--
-- En ambos casos se usa `on conflict (email) do nothing` para reproducibilidad.

commit;
