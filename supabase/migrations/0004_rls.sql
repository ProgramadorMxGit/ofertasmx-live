-- 0004_rls.sql — Row Level Security (RLS), allowlist de administradores e is_admin().
--
-- Tarea 9.1 del plan "Ofertas Reales IA".
-- Requisitos: R8.1 (RLS en todas las tablas sensibles), R8.2 (el público solo lee
--             ofertas 'active'), R8.3 (el público no inserta/edita/borra ofertas),
--             R8.4 (el público no lee payloads/logs/analítica/allowlist),
--             R8.6 / R10.6 (identidad de admin por allowlist + is_admin()),
--             R3.5 (base para la lectura pública del catálogo de categorías).
--
-- Modelo de roles de Supabase (R8.5): `anon` (Visitante Público) y `authenticated`
-- (Administrador) quedan sujetos a RLS; el rol de servicio
-- (`SUPABASE_SERVICE_ROLE_KEY`) BYPASSA RLS por diseño y es el único que escribe
-- desde procesos de servidor. Sin política aplicable, RLS DENIEGA por defecto.
--
-- ───────────────────────────────────────────────────────────────────────────
-- COMPATIBILIDAD DE ENTORNO (bloques GUARDADOS; no-op en Supabase real)
-- ───────────────────────────────────────────────────────────────────────────
-- En Supabase ya existen los roles `anon`/`authenticated`, el esquema `auth` y la
-- función `auth.jwt()`. En un Postgres "vanilla" (p. ej. el contenedor de las
-- pruebas de integración) NO existen, y sin ellos esta migración ni siquiera
-- podría aplicarse: las políticas referencian esos roles y el cuerpo de
-- `is_admin()` se valida contra `auth.jwt()`. Por eso, de forma idempotente y solo
-- SI FALTAN, creamos los mínimos imprescindibles. En Supabase estos bloques no
-- ejecutan ninguna sentencia (las comprobaciones `if not exists` resultan falsas).

-- Roles de Supabase (creados solo si faltan).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end
$$;

-- Esquema `auth` de Supabase (no-op si ya existe).
create schema if not exists auth;

-- `auth.jwt()`: en Supabase la provee la plataforma con los claims del JWT ya
-- verificado. Aquí creamos un EQUIVALENTE únicamente si falta, que lee los claims
-- de la GUC `request.jwt.claims` (idéntico mecanismo al de Supabase/PostgREST).
-- Permite simular sesiones en pruebas sin tocar la función real de Supabase.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    create function auth.jwt() returns jsonb
    language sql stable as $body$
      select coalesce(
        nullif(current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb
    $body$;
  end if;
end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Allowlist de administradores e is_admin() (R8.6, R10.6)
-- ───────────────────────────────────────────────────────────────────────────
-- `ADMIN_EMAIL` (env de servidor) es la fuente de verdad a nivel de aplicación.
-- Como una política RLS no puede leer variables de entorno, el allowlist se
-- replica en esta tabla mínima, poblada por el seed que lee `ADMIN_EMAIL`.
-- `is_admin()` compara, sin distinguir mayúsculas, el claim `email` del JWT contra
-- el allowlist. Es `security definer` para poder leer `admin_allowlist` aun con
-- RLS habilitado, y fija `search_path = public` para evitar inyección por
-- search_path.
create table if not exists public.admin_allowlist (
  email text primary key
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_allowlist
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Habilitar RLS en todas las tablas con datos sensibles (R8.1)
-- ───────────────────────────────────────────────────────────────────────────
alter table public.offers            enable row level security;
alter table public.telegram_updates  enable row level security;
alter table public.offer_clicks      enable row level security;
alter table public.offer_categories  enable row level security;
alter table public.admin_audit_logs  enable row level security;
alter table public.admin_allowlist   enable row level security;

-- ───────────────────────────────────────────────────────────────────────────
-- Políticas por tabla. `create policy` no admite `if not exists`, así que cada
-- política se precede de `drop policy if exists` para que la migración sea
-- reaplicable sin error (idempotent-friendly).
-- ───────────────────────────────────────────────────────────────────────────

-- offers: el público (anon) SOLO lee ofertas activas (R8.2). No hay política de
-- insert/update/delete para anon => esas operaciones quedan DENEGADAS (R8.3).
drop policy if exists offers_public_read on public.offers;
create policy offers_public_read on public.offers
  for select to anon
  using (status = 'active');

-- offers: el admin (authenticated presente en el allowlist) lee y gestiona todo
-- (R8.6). `for all` cubre select/insert/update/delete bajo is_admin().
drop policy if exists offers_admin_all on public.offers;
create policy offers_admin_all on public.offers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- offer_categories: catálogo no sensible, lectura pública (R3.5, soporte de R4.14).
drop policy if exists categories_public_read on public.offer_categories;
create policy categories_public_read on public.offer_categories
  for select to anon
  using (true);

-- offer_categories: gestión del catálogo por el admin.
drop policy if exists categories_admin_all on public.offer_categories;
create policy categories_admin_all on public.offer_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- telegram_updates: sin acceso para anon (R8.4); solo el admin puede leer.
drop policy if exists updates_admin_read on public.telegram_updates;
create policy updates_admin_read on public.telegram_updates
  for select to authenticated
  using (public.is_admin());

-- admin_audit_logs: sin acceso para anon (R8.4); solo el admin puede leer.
drop policy if exists audit_admin_read on public.admin_audit_logs;
create policy audit_admin_read on public.admin_audit_logs
  for select to authenticated
  using (public.is_admin());

-- offer_clicks: analítica privada (R8.4). Sin política para anon => lectura
-- DENEGADA por defecto. La inserción del clic la realiza el redirector con el rol
-- de servicio (bypassa RLS). Solo el admin puede consultar la analítica.
drop policy if exists clicks_admin_read on public.offer_clicks;
create policy clicks_admin_read on public.offer_clicks
  for select to authenticated
  using (public.is_admin());

-- admin_allowlist: legible solo por el admin (el rol de servicio bypassa RLS).
-- Sin política para anon => DENEGADO por defecto (R8.4).
drop policy if exists allowlist_admin_read on public.admin_allowlist;
create policy allowlist_admin_read on public.admin_allowlist
  for select to authenticated
  using (public.is_admin());

-- Reafirmación (defensa en profundidad): al no existir política aplicable, RLS
-- DENIEGA salvo permiso explícito. Por eso anon no puede insertar/editar/borrar
-- ofertas (R8.3) ni leer payloads/logs/analítica/allowlist (R8.4); el admin lee y
-- gestiona vía is_admin() (R8.6); y las escrituras de servidor usan el rol de
-- servicio, que BYPASSA RLS (R8.5). La clave de servicio jamás llega al navegador
-- (R8.7): vive solo en módulos `server-only`.
