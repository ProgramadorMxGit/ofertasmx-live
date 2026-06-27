-- 0005_storage.sql — Política del bucket público de imágenes `offer-images`.
--
-- Tarea 9.2 del plan "Ofertas Reales IA".
-- Requisitos: R3.5 (lectura pública de imágenes de oferta), R3.6 (escritura solo
--             del servidor; las URLs almacenadas son públicas y estables, nunca
--             URLs temporales de Telegram ni portadoras del Token del Bot).
--
-- Intención codificada: bucket `offer-images` PÚBLICO (lectura por URL) con
-- política de `select` para `anon`/`authenticated`; `insert`/`update`/`delete`
-- DENEGADOS a `anon` (no se crea política => denegado por defecto). Las subidas
-- las realiza el Procesador de Imágenes con el rol de servicio, que BYPASSA RLS.
--
-- NOTA: en Supabase el bucket suele crearse además desde el dashboard/API; esta
-- migración deja la política como fuente de verdad reproducible.
--
-- COMPATIBILIDAD: el esquema `storage` y la tabla `storage.objects` solo existen
-- en Supabase. En un Postgres "vanilla" (pruebas de integración) no existen, por
-- lo que TODO va dentro de un bloque GUARDADO que no hace nada si falta `storage`.
-- Las sentencias usan EXECUTE (SQL dinámico) para que solo se analicen en tiempo
-- de ejecución cuando la rama se toma (evita errores de planificación al aplicar
-- la migración donde `storage.objects` no existe).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    -- Bucket público `offer-images` (idempotente). `public = true` habilita la
    -- lectura por URL pública estable.
    execute $sql$
      insert into storage.buckets (id, name, public)
      values ('offer-images', 'offer-images', true)
      on conflict (id) do update set public = true
    $sql$;

    -- Lectura pública SOLO de los objetos del bucket `offer-images` (R3.5).
    -- Idempotente: se elimina la política previa antes de recrearla.
    execute 'drop policy if exists offer_images_public_read on storage.objects';
    execute $sql$
      create policy offer_images_public_read on storage.objects
        for select to anon, authenticated
        using (bucket_id = 'offer-images')
    $sql$;

    -- Sin políticas de insert/update/delete para anon => escritura DENEGADA por
    -- defecto (R3.6). Las subidas las hace el servidor con el rol de servicio.
  end if;
end
$$;
