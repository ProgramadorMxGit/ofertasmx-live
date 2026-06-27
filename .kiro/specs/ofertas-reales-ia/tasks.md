# Plan de Implementación: Ofertas Reales IA

Este plan convierte el diseño en pasos de codificación incrementales para "Ofertas Reales IA". El orden es de adentro hacia afuera: primero la lógica pura y verificable de `lib/` (dinero, parser, SSRF, identidad/deduplicación), luego la capa de datos (migraciones, RLS, clientes, seeds), después la ingesta (imágenes, webhook, script, Cron), las APIs públicas y la UI (sistema de diseño, tarjeta, listas, tiempo real, páginas), el SEO, React Bits, el panel de administración, y finalmente accesibilidad, pruebas e2e, auditoría de rendimiento y documentación. Cada tarea construye sobre las anteriores y las tareas posteriores conectan (wire) las piezas previas para que no quede código huérfano. El stack es Next.js (App Router) + TypeScript estricto, Tailwind + tokens, shadcn/ui, Supabase, Zod, React Hook Form, `decimal.js`, Motion (GSAP solo para React Bits), Lucide, Vitest, Playwright y `fast-check`.

## Tareas

- [x] 1. Andamiaje del proyecto y esqueleto de carpetas
  - Inicializar Next.js (App Router) con TypeScript en modo estricto (`strict: true`, `noImplicitAny: true`), instalar dependencias base (Zod, React Hook Form, `decimal.js`, `framer-motion`, `gsap`, `lucide-react`, `@supabase/ssr`, `@supabase/supabase-js`, `sharp`)
  - Configurar Tailwind CSS con cableado de tokens (utilidades `hsl(var(--token))`), inicializar shadcn/ui y configurar ESLint
  - Configurar Vitest (unitarias e integración) y `fast-check`, y Playwright (e2e) con sus scripts en `package.json`
  - Crear el esqueleto de carpetas de la sección "Estructura del proyecto" del diseño (`app/(public)`, `app/(admin)`, `app/api`, `components/{ui,offers,layout,admin}`, `lib/{supabase,telegram,parser,ssrf,dedup,utils}`, `supabase/{migrations}`, `scripts`, `tests/{unit,integration,e2e,fixtures}`, `docs`, `public`)
  - _Requisitos: R19.3, R19.6, R29.1, R29.3, R29.4_

- [x] 2. Validación de entorno y `.env.example`
  - [x] 2.1 Implementar `.env.example` y `lib/env.ts`
    - Crear `.env.example` con valores vacíos o seguros para todas las variables (chat id `5054325626`, `AMAZON_TRACKING_ID=programadormx-20`, `NEXT_PUBLIC_SITE_URL=https://programadormx.online`, `NEXT_PUBLIC_WHATSAPP_INVITE_URL`); los secretos quedan vacíos
    - Implementar `lib/env.ts` con esquemas Zod separados de servidor y público; mantener secretos sin prefijo `NEXT_PUBLIC_` y marcar el módulo de servidor como `server-only`
    - Validar al arranque y fallar con mensaje claro en producción listando solo NOMBRES de variables faltantes, nunca valores de secretos
    - _Requisitos: R27.1, R27.2, R27.3, R27.4, R27.5_
  - [x]* 2.2 Escribir pruebas unitarias de validación de entorno
    - Verificar que falta de variable requerida produce error claro y que ningún valor de secreto aparece en mensajes
    - _Requisitos: R27.4, R27.5_

- [x] 3. Utilidades de dinero y formato (lógica pura)
  - [x] 3.1 Implementar envoltura de `decimal.js`, formato tabular y cálculo de ahorro
    - Seguir TDD: escribir primero pruebas unitarias de ejemplo (centavos, miles, ahorro `original - current >= 0`) que fallen y luego implementar
    - Crear `lib/utils/money.ts` con operaciones decimales exactas (sin punto flotante), formato de precios con números tabulares y función de ahorro absoluto
    - _Requisitos: R4.7, R14.1_
  - [x]* 3.2 Escribir prueba de propiedad del cálculo de ahorro
    - **Propiedad 18: Cálculo de ahorro absoluto**
    - **Validates: Requirements 14.1**

- [x] 4. Módulo de parser y normalización de mensajes (lógica pura)
  - [x] 4.1 Implementar la normalización de texto
    - Seguir TDD: escribir primero pruebas de ejemplo (NBSP, zero-width, saltos de línea, moneda/decimales/porcentajes) que fallen, luego implementar
    - Crear `lib/parser/normalize.ts` con normalización idempotente de espacios unicode, caracteres invisibles, saltos de línea, URLs, moneda, decimales y porcentajes; incluir `normalizeTitle` y `normalizeDestination`
    - _Requisitos: R4.1, R4.2, R4.3_
  - [x]* 4.2 Escribir prueba de propiedad de normalización idempotente
    - **Propiedad 1: Normalización idempotente**
    - **Validates: Requirements 4.1, 4.2**
  - [x] 4.3 Implementar extracción de campos, precios y conciliación de descuento
    - Seguir TDD: escribir primero pruebas de ejemplo de precios tolerantes y reglas de descuento que fallen, luego implementar
    - Detectar título (texto previo a la primera línea promocional), extraer precios con `Decimal`, recalcular descuento exacto, aplicar la regla de tolerancia ±1 pp (corregir en silencio o marcar `needs_review`), aplicar reglas de rechazo y la regla de no invención de campos
    - Extraer al menos `title`, `original_price`, `current_price`, `discount_percent`, `affiliate_url`, `merchant`, `platform`, `external_product_id`, `raw_text`, `telegram_message_id`, `telegram_update_id`, `published_at`; permitir oferta sin precio original con `discount_percent = null`
    - _Requisitos: R4.4, R4.5, R4.6, R4.7, R4.8, R4.9, R4.10, R4.11, R4.12, R4.13_
  - [x]* 4.4 Escribir prueba de propiedad del cálculo de descuento y ofertas sin precio original
    - **Propiedad 2: Cálculo de descuento decimal y ofertas sin precio original**
    - **Validates: Requirements 4.7, 4.12**
  - [x]* 4.5 Escribir prueba de propiedad de la tolerancia ±1 punto y marca de revisión
    - **Propiedad 3: Tolerancia de descuento de ±1 punto y marca de revisión**
    - **Validates: Requirements 4.8, 4.9**
  - [x]* 4.6 Escribir prueba de propiedad del rechazo de precios inválidos
    - **Propiedad 4: Rechazo de precios inválidos**
    - **Validates: Requirements 4.10, 4.11**
  - [x]* 4.7 Escribir prueba de propiedad de no invención de campos
    - **Propiedad 5: No invención de campos del parser**
    - **Validates: Requirements 4.13**
  - [x] 4.8 Implementar el clasificador de categorías por palabras clave
    - Seguir TDD: escribir primero pruebas de ejemplo (cada categoría y respaldo `Otros`) que fallen, luego implementar
    - Crear mapa configurable de palabras clave sobre el título hacia `Electrónica, Hogar, Moda, Herramientas, Oficina, Belleza, Deportes, Otros`, con `Otros` como respaldo total
    - _Requisitos: R4.14_
  - [x]* 4.9 Escribir prueba de propiedad de clasificación total de categoría
    - **Propiedad 6: Clasificación total de categoría con respaldo 'Otros'**
    - **Validates: Requirements 4.14**

- [x] 5. Validador de dominios SSRF, resolutor de enlaces y extracción de identificadores (lógica pura)
  - [x] 5.1 Implementar la lista de dominios permitidos y la validación de URL
    - Seguir TDD: escribir primero casos de rechazo SSRF (no-HTTPS, `localhost`, IP privada/reservada, metadatos de nube, credenciales embebidas, dominio fuera de lista) que fallen, luego implementar
    - Crear `lib/ssrf/validate.ts` con allowlist configurable inicial (`amazon.com.mx`, `www.amazon.com.mx`, `amzn.to`, `mercadolibre.com.mx`, `www.mercadolibre.com.mx`, `meli.la`) y rechazo sin realizar ninguna solicitud
    - _Requisitos: R5.1, R5.2, R5.3_
  - [x] 5.2 Implementar el resolutor seguro de enlaces cortos
    - Limitar redirecciones, aplicar timeout y tamaño máximo de respuesta, re-validar esquema/host y resolver DNS en cada salto (mitigar DNS rebinding) y verificar que el dominio final siga permitido
    - _Requisitos: R5.4_
  - [x]* 5.3 Escribir prueba de propiedad de allowlist y protección SSRF
    - **Propiedad 8: Allowlist de dominios y protección SSRF**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  - [x] 5.4 Implementar extracción de ASIN/MLM y manejo del tag de afiliado
    - Seguir TDD: escribir primero pruebas de extracción (rutas `/dp/`, `/gp/product/`, parámetro `asin`, `MLM\d+`) y verificación de tag que fallen, luego implementar
    - Detectar ASIN y MLM; preservar el parámetro `tag` de Amazon sin reemplazarlo; comparar contra `AMAZON_TRACKING_ID` y marcar `needs_review` si difiere sin alterar el enlace; conservar parámetros de atribución de Mercado Libre
    - _Requisitos: R5.5, R5.6, R5.7, R5.8, R5.9_
  - [x]* 5.5 Escribir prueba de propiedad de extracción round-trip del identificador externo
    - **Propiedad 7: Extracción round-trip de identificador externo**
    - **Validates: Requirements 5.5, 5.9**
  - [x]* 5.6 Escribir prueba de propiedad de preservación y verificación del tag
    - **Propiedad 9: Preservación y verificación del tag de afiliado**
    - **Validates: Requirements 5.6, 5.7, 5.8**

- [x] 6. Identidad de producto (fingerprint, slug) y motor de deduplicación (lógica pura)
  - [x] 6.1 Implementar el cálculo del fingerprint
    - Seguir TDD: escribir primero pruebas de determinismo (misma identidad → mismo fingerprint; identidad distinta → distinto) que fallen, luego implementar
    - Crear `lib/dedup/fingerprint.ts` como `sha256(platform : external_product_id : títuloNormalizado : destinoNormalizado)` reutilizando `lib/parser/normalize.ts` y `lib/ssrf`
    - _Requisitos: R7.2_
  - [x]* 6.2 Escribir prueba de propiedad del determinismo del fingerprint
    - **Propiedad 10: Determinismo del fingerprint**
    - **Validates: Requirements 7.2**
  - [x] 6.3 Implementar la generación del `slug`
    - Seguir TDD: escribir primero pruebas (URL-safe; estable ante reproceso de la misma identidad; identidades distintas → slugs distintos) que fallen, luego implementar
    - Crear `slug = slugify(normalizeTitle(title)) + "-" + shortHash(identity)` con `identity = platform:external_product_id` o, en su defecto, el fingerprint
    - _Requisitos: R6.4, R7.6_
  - [x]* 6.4 Escribir prueba de propiedad de estabilidad y formato del slug
    - **Propiedad 16: Estabilidad y formato del slug**
    - **Validates: Requirements 6.4, 7.6**
  - [x] 6.5 Implementar el motor de deduplicación
    - Seguir TDD: escribir primero pruebas de resolución por orden de prioridad y decisión actualizar-vs-insertar que fallen, luego implementar
    - Resolver coincidencias en orden (plataforma+id externo, ASIN, MLM, `telegram_message_id`, fingerprint); decidir actualización de precio/descuento/fecha conservando `slug` e imagen, marcando el cambio como UPDATE; conservar historial cuando sea útil
    - _Requisitos: R7.1, R7.3, R7.4, R7.5_
  - [x]* 6.6 Escribir prueba de propiedad de deduplicación sin duplicar y emisión de UPDATE
    - **Propiedad 11: Deduplicación actualiza sin duplicar y emite UPDATE**
    - **Validates: Requirements 7.1, 7.3, 7.5**

- [x] 7. Punto de control — lógica pura
  - Asegurar que todas las pruebas pasen; preguntar al usuario si surgen dudas.

- [x] 8. Migraciones SQL del esquema de base de datos
  - [x] 8.1 Implementar la migración de enums y la tabla `offers`
    - Crear `supabase/migrations/0001_init.sql` con `offer_status`, `platform_t`, extensión `pgcrypto` y la tabla `offers` con todos los campos del diseño y los CHECK (`current_price >= 0`, `original_price >= 0`, `discount_percent` 0–100, `active_requires_affiliate`, `price_relationship`), más `image_status`/`image_retry_count`/`image_last_attempt_at`/`affiliate_tag`
    - _Requisitos: R6.2, R6.3, R6.7, R6.8_
  - [x] 8.2 Implementar las tablas auxiliares
    - Crear `telegram_updates` (PK `update_id`, `processing_status`, `payload` JSONB), `offer_clicks` (analítica mínima sin IP completa), `offer_categories` y `admin_audit_logs`
    - _Requisitos: R6.1, R6.9, R6.10, R6.11_
  - [x] 8.3 Implementar índices, unicidad y triggers
    - Crear índice único de `slug`, índice de `fingerprint`, índice `(platform, external_product_id)`, índice único parcial `(telegram_chat_id, telegram_message_id)`, índices parciales `where status='active'` para orden por recientes y por descuento, trigger de `updated_at`; permitir `expires_at` nulo
    - _Requisitos: R6.4, R6.5, R6.6, R6.12_
  - [x]* 8.4 Escribir pruebas de integración de las restricciones de la base de datos
    - Verificar CHECK de precios/estado, unicidad de `slug` y de `message_id`, y que `active` exige `affiliate_url`
    - _Requisitos: R6.4, R6.6, R6.7, R6.8_

- [x] 9. Migración de RLS y políticas de Storage
  - [x] 9.1 Implementar la migración de RLS
    - Habilitar RLS en todas las tablas sensibles; crear `admin_allowlist` y la función `is_admin()`; política de lectura pública solo de ofertas `active`; lectura pública del catálogo de categorías; políticas de gestión total para admin; denegar a `anon` la lectura de `telegram_updates`, `admin_audit_logs` y analítica de clics (denegado por defecto)
    - _Requisitos: R8.1, R8.2, R8.3, R8.4, R8.6, R10.6, R3.5_
  - [x] 9.2 Implementar las políticas del bucket de Storage `offer-images`
    - Configurar lectura pública y escritura solo del servidor (rol de servicio); denegar `insert`/`update`/`delete` a `anon`
    - _Requisitos: R3.5, R3.6_
  - [x]* 9.3 Escribir pruebas de integración de RLS
    - Verificar que `anon` ve solo ofertas `active`, no puede insertar/editar/eliminar ni leer payloads/logs, y que el admin ve todo
    - _Requisitos: R8.2, R8.3, R8.4_

- [x] 10. Clientes de Supabase con fronteras servidor/cliente
  - Implementar `lib/supabase/server.ts` (anon por cookies, `@supabase/ssr`), `lib/supabase/service.ts` (rol de servicio, `server-only`) y `lib/supabase/browser.ts` (anon)
  - Garantizar que `SUPABASE_SERVICE_ROLE_KEY` solo se use en módulos `server-only` y nunca llegue al bundle del navegador
  - _Requisitos: R8.5, R8.7_

- [x] 11. Datos de demostración (seeds)
  - Implementar `supabase/seed.sql` con ofertas ficticias claramente marcadas como demostración que cubran los estados activa, recién publicada, destacada, sin precio original, expirada y `needs_review`, además de ofertas de Amazon, de Mercado Libre y una sin imagen; sembrar categorías y `admin_allowlist` desde `ADMIN_EMAIL`
  - _Requisitos: R24.1, R24.2, R24.3_

- [x] 12. Punto de control — capa de datos
  - Asegurar que todas las pruebas pasen; preguntar al usuario si surgen dudas.

- [x] 13. Procesador de imágenes de Telegram (servidor)
  - [x] 13.1 Implementar obtención y descarga de archivos de Telegram
    - Crear `lib/telegram/files.ts` para seleccionar la foto de mayor resolución razonable y descargar vía `getFile` en el servidor sin exponer el Token del Bot
    - _Requisitos: R3.1, R3.2_
  - [x] 13.2 Implementar validación, almacenamiento y variantes con respaldo
    - Validar MIME/tamaño/extensión/dimensiones con `sharp`; generar nombre de archivo seguro; subir a Storage `offer-images` y guardar URL pública estable (sin token ni URL temporal); generar variantes optimizadas; ante fallo, guardar con imagen de respaldo, `image_status='failed'`, registrar el motivo y habilitar reintento
    - _Requisitos: R3.3, R3.4, R3.5, R3.6, R3.7, R3.8_
  - [x]* 13.3 Escribir prueba de propiedad de selección y validación de imagen
    - **Propiedad 21: Selección y validación de imagen**
    - **Validates: Requirements 3.1, 3.3, 3.4**
  - [x]* 13.4 Escribir pruebas unitarias con fixtures del flujo de respaldo y reintento
    - Usar fixtures locales (sin bot real) para verificar rechazo con motivo registrado y guardado con respaldo
    - _Requisitos: R3.4, R3.8_

- [x] 14. Endpoint del webhook de Telegram (orquestación e integración)
  - [x] 14.1 Implementar la comparación de secreto en tiempo constante y el logging sin secretos
    - Crear utilidad con `crypto.timingSafeEqual` sobre buffers de igual longitud y un logger estructurado que excluya `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` y `SUPABASE_SERVICE_ROLE_KEY`
    - _Requisitos: R1.3, R1.4, R1.16_
  - [x]* 14.2 Escribir prueba de propiedad de la comparación de secreto en tiempo constante
    - **Propiedad 14: Comparación de secreto en tiempo constante equivale a igualdad**
    - **Validates: Requirements 1.3, 1.4**
  - [x]* 14.3 Escribir prueba de propiedad de ausencia de secretos en logs
    - **Propiedad 15: Ausencia de secretos en logs y mensajes**
    - **Validates: Requirements 1.16, 27.5**
  - [x] 14.4 Implementar el esquema Zod del Update y la extracción de campos
    - Crear `lib/telegram/schema.ts` que reconozca `message`, `edited_message`, `channel_post`, `edited_channel_post` y extraiga `update_id`, `message_id`, `chat.id`, `text`, `caption`, `photo`, `date`, `edit_date`, `entities`, `caption_entities`
    - _Requisitos: R1.6, R1.8, R1.9_
  - [x] 14.5 Implementar el route handler `/api/telegram/webhook` que conecta el pipeline
    - Aplicar las guardas en orden (POST/405, secreto/401, tamaño/413, Zod/400 con log técnico, compuerta de chat `5054325626`), persistir de forma idempotente en `telegram_updates`, procesar dentro del presupuesto de tiempo y responder 200 rápido; conectar parser + validador SSRF + motor de deduplicación + procesador de imágenes + persistencia; degradar con respaldo de imagen; responder 5xx solo ante fallo interno real; escribir en `admin_audit_logs` al procesar un `edited_message`
    - _Requisitos: R1.1, R1.2, R1.5, R1.7, R1.10, R1.11, R1.12, R1.13, R1.14, R1.15, R7.7, R10.3_
  - [x]* 14.6 Escribir prueba de propiedad de la compuerta de Chat Autorizado
    - **Propiedad 13: Compuerta de Chat Autorizado**
    - **Validates: Requirements 1.10, 1.11**
  - [x]* 14.7 Escribir prueba de propiedad de idempotencia por `update_id`
    - **Propiedad 12: Idempotencia por `update_id` ante reintentos**
    - **Validates: Requirements 1.12, 1.15**
  - [x]* 14.8 Escribir pruebas de integración del webhook con Supabase y Telegram mockeados
    - Cubrir secreto válido/inválido, chat autorizado/no autorizado, actualización duplicada, mensaje nuevo, mensaje editado, mensaje con y sin foto, oferta inválida, URL no permitida, tracking id incorrecto y actualización de precio
    - _Requisitos: R29.2_

- [x] 15. Script de registro del webhook
  - [x] 15.1 Implementar `scripts/register-telegram-webhook.ts`
    - Leer el Token del Bot solo de `TELEGRAM_BOT_TOKEN` y abortar con error claro si falta; modo `set` (configura `setWebhook` con URL, `secret_token` y `allowed_updates` mínimos) y modo `status` (`getWebhookInfo`); enmascarar/omitir el token y el `secret_token` en la salida
    - _Requisitos: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.7_
  - [x]* 15.2 Escribir pruebas unitarias del script con Telegram mockeado
    - Verificar que el token nunca se imprime y que se aborta cuando falta `TELEGRAM_BOT_TOKEN`
    - _Requisitos: R2.4, R2.7_

- [x] 16. Ruta de Cron de Vercel (mantenimiento)
  - [x] 16.1 Implementar `/api/cron` protegida por `CRON_SECRET`
    - Reintentar imágenes `pending`/`failed` con backoff usando el procesador de imágenes; marcar `expired` las ofertas `active` cuyo `expires_at` ya transcurrió y propagar el cambio por Realtime; no expirar nunca por tiempo las ofertas sin `expires_at`; configurar el cron en `vercel.json`
    - _Requisitos: R3.8, R9.9, R9.10_
  - [x]* 16.2 Escribir pruebas de la lógica del Cron
    - Verificar que solo se expiran ofertas con `expires_at` vencido, que `expires_at` nulo nunca expira y que el reintento de imagen respeta el backoff
    - _Requisitos: R9.9, R9.10_

- [x] 17. Punto de control — backend e ingesta
  - Asegurar que todas las pruebas pasen; preguntar al usuario si surgen dudas.

- [x] 18. API pública de ofertas
  - [x] 18.1 Implementar `/api/offers` y `/api/offers/[id]`
    - Listar con filtros (plataforma, categoría, descuento mínimo, rango de precio, orden) y paginación por keyset sobre los índices parciales `where status='active'`; obtener oferta por id; Server Components por defecto
    - _Requisitos: R16.1, R16.2, R19.6, R10.3_
  - [x]* 18.2 Escribir pruebas de integración de filtros y paginación
    - Verificar combinaciones de filtros y la estabilidad de la paginación por cursor
    - _Requisitos: R16.1, R16.2_

- [x] 19. Redirector de clics
  - [x] 19.1 Implementar `/api/click/[offerId]`
    - Validar que la oferta exista; registrar analítica mínima (`source`, dominio del `Referer`, sin IP completa); redirigir 302 únicamente a la `affiliate_url` almacenada (sin redirección abierta); responder error sin redirigir si la oferta no existe; los botones externos usan `rel="sponsored nofollow noopener"`
    - _Requisitos: R11.1, R11.2, R11.3, R11.4, R11.5, R11.6, R10.3_
  - [x]* 19.2 Escribir prueba de propiedad de la redirección cerrada del Servicio de Clics
    - **Propiedad 17: Redirección cerrada del Servicio de Clics**
    - **Validates: Requirements 11.4, 11.5, 11.6**

- [x] 20. Sistema de diseño (tokens, tipografía, marca, base de animación)
  - [x] 20.1 Implementar los temas de tokens CSS y el mapeo en Tailwind
    - Definir tokens semánticos para el tema oscuro (predeterminado) y un tema claro plenamente funcional (no invertido); prohibir hex dispersos usando solo tokens; mapear `hsl(var(--token))` a utilidades de Tailwind
    - _Requisitos: R12.3, R12.4, R12.5_
  - [x] 20.2 Implementar la tipografía con `next/font` y la escala fluida
    - Cargar Geist Sans (interfaz) e Instrument Serif (acento editorial), aplicar `tabular-nums` a precios/descuentos/estadísticas y una escala con `clamp()` legible en Android de gama baja
    - _Requisitos: R12.6, R12.7_
  - [x] 20.3 Implementar el `ThemeToggle` sin FOUC y los recursos de marca
    - Aplicar `data-theme` en `<html>` con persistencia y script inline antes de pintar; crear `logo.svg`, `mark.svg`, `favicon.svg` y `apple-touch-icon` con identidad propia (sin emoji de robot/fuego)
    - _Requisitos: R12.1, R12.2, R12.3_
  - [x] 20.4 Implementar la base del sistema de animaciones
    - Definir tokens de duración y la curva de easing principal; animar solo `opacity` y `transform`; helpers para pausar fuera de pantalla, limitar `mousemove` con `requestAnimationFrame`, respetar `prefers-reduced-motion` y no retrasar el LCP/H1
    - _Requisitos: R18.1, R18.2, R18.3, R18.4, R18.5, R18.6_

- [x] 21. Estados compartidos de la interfaz
  - [x] 21.1 Implementar los componentes de estado de UI
    - Crear estados de carga premium, esqueleto, vacío, sin resultados, error de red, Realtime desconectado, reintentando, oferta expirada, imagen no disponible, datos incompletos, sin destacados y mantenimiento, todos con mensajes amables y no técnicos
    - _Requisitos: R26.1, R26.2_
  - [x] 21.2 Implementar `not-found.tsx` (404) y `global-error.tsx`
    - Páginas de 404 y error global con copia amable y enlaces de regreso
    - _Requisitos: R26.1, R26.2_

- [x] 22. Componente `OfferCard`
  - [x] 22.1 Implementar la compuerta de efectos premium (lógica pura)
    - Seguir TDD: escribir primero pruebas de la compuerta (destacada Y primera fila Y `pointer: fine` Y sin `prefers-reduced-motion` Y sin `Save-Data`) que fallen, luego implementar
    - _Requisitos: R14.4, R14.5_
  - [x]* 22.2 Escribir prueba de propiedad de la compuerta de efectos premium
    - **Propiedad 19: Compuerta de efectos premium**
    - **Validates: Requirements 14.4, 14.5**
  - [x] 22.3 Implementar la anatomía completa de `OfferCard`
    - Renderizar imagen (`object-fit: contain`), plataforma, estado en vivo, título, descuento, precio original con `<del>`, precio actual tabular, ahorro absoluto cuando sea calculable, horas de publicación y verificación, botón primario evidente sin hover y compartir; representar estados "nueva" y "expirada"; aplicar la jerarquía visual y el radio/elevación/escala definidos; accesibilidad completa; conectar la compuerta premium y el formato de dinero
    - _Requisitos: R14.1, R14.2, R14.3, R14.6, R14.7_

- [x] 23. Cuadrícula/lista de ofertas, filtros y búsqueda
  - [x] 23.1 Implementar la serialización de estado de filtros hacia la URL (lógica pura)
    - Seguir TDD: escribir primero pruebas de round-trip (estado → `searchParams` → estado) que fallen, luego implementar
    - _Requisitos: R16.3, R16.4_
  - [x]* 23.2 Escribir prueba de propiedad del estado de filtros sincronizado con la URL
    - **Propiedad 23: Estado de filtros sincronizado con la URL (round-trip)**
    - **Validates: Requirements 16.3, 16.4**
  - [x] 23.3 Implementar `OfferGrid`/`OfferList` y `Filters`
    - Vista de cuadrícula o lista que reutiliza `OfferCard`; filtros por plataforma, categoría, descuento mínimo, rango de precio y orden sincronizados con la URL y restaurados al usar "atrás"
    - _Requisitos: R16.1, R16.2, R16.3, R16.4_
  - [x] 23.4 Implementar `SearchCommand`
    - Búsqueda con debounce en título y plataforma, resaltado discreto de coincidencias, estado de "sin resultados" y apertura con la tecla "/" y Ctrl/Cmd+K fuera de campos de formulario
    - _Requisitos: R16.5, R16.6, R16.7_

- [x] 24. Hook de tiempo real e indicador de conexión
  - [x] 24.1 Implementar `useOffersRealtime`
    - Suscribir a `postgres_changes` sobre `offers` con la clave anónima; manejar INSERT (insertar en posición ordenada, aviso discreto, sin sonido/robo de foco/salto de scroll), UPDATE (parchear precio/descuento y resaltar sin re-montar), expiración (retiro y filtrado local por `expires_at`); reconexión con retroceso exponencial y resincronización tras reconectar; `aria-live` moderado
    - _Requisitos: R9.1, R9.2, R9.3, R9.4, R9.5, R9.7, R9.8, R25.6_
  - [x] 24.2 Implementar `ConnectionIndicator` y conectar con la cuadrícula
    - Mostrar estado en vivo y "Reconectando…"; cablear el estado del hook hacia `OfferGrid`/`OfferList` con la animación de entrada y el aviso "Nueva oferta encontrada"
    - _Requisitos: R9.2, R9.4, R9.7, R13.7_
  - [x]* 24.3 Escribir pruebas unitarias del reductor de tiempo real
    - Verificar posición de inserción, parcheo en actualización, retiro en expiración y fusión por `id` en la resincronización
    - _Requisitos: R9.2, R9.4, R9.5, R9.8_

- [x] 25. Chrome del layout (encabezado, navegación móvil, pie, barra de confianza)
  - [x] 25.1 Implementar `Header` y `MobileNav`
    - Encabezado fijo transparente que pasa a superficie oscura semitransparente al desplazar (blur moderado, borde fino, sombra sutil, altura reducida) con navegación, CTA de WhatsApp, conmutador de tema y botón de búsqueda; cajón móvil accesible con áreas táctiles ≥44px sin depender de hover y sin duplicar barra inferior redundante
    - _Requisitos: R13.1, R13.2, R13.3, R17.2, R17.4, R17.5_
  - [x] 25.2 Implementar `Footer`, `TrustBar` y los puntos de quiebre responsivos
    - Barra de confianza solo con indicadores honestos (sin cifras inventadas); pie de página con las páginas públicas; diseño mobile-first verificado en 360×800/390×844/412×915 y adaptado a 768/1024/1280/1440/1920, sin efectos de ratón en móvil, sin desbordamiento horizontal e imágenes optimizadas
    - _Requisitos: R13.5, R13.6, R13.11, R17.1, R17.3_

- [x] 26. Página de inicio
  - Implementar `/` con SSR de la lista inicial; hero editorial asimétrico con tarjetas demo e indicador de flujo en vivo; sección de ofertas en vivo (indicador de conexión, hora de última actualización, filtros, búsqueda, orden, cuadrícula/lista, esqueletos, estados vacíos, carga progresiva); destacados (cuadrícula asimétrica en escritorio, carrusel solo móvil sin rotación automática); "Cómo funciona" honesto; bloque de transparencia y CTA final de WhatsApp sin temporizadores falsos; conectar cuadrícula, tiempo real, barra de confianza y hero
  - _Requisitos: R13.4, R13.7, R13.8, R13.9, R13.10_

- [x] 27. Página de detalle de oferta
  - [x] 27.1 Implementar `/ofertas/[slug]`
    - Mostrar migas de pan, datos completos, CTA con aviso de afiliado contiguo (`rel="sponsored nofollow noopener"`), descripción editorial, características/consideraciones cuando existan, ofertas relacionadas, compartir y estado expirado con aviso "Esta oferta podría haber terminado"; excluir reseñas/existencias/cantidades/"comprando ahora"/cuentas regresivas/insignias inventadas
    - _Requisitos: R15.1, R15.2, R15.3, R15.4, R9.6_
  - [x] 27.2 Implementar divulgaciones de afiliado, tratamiento honesto de precios y arquitectura preparada
    - Mostrar las divulgaciones requeridas y la etiqueta "Enlace de afiliado", "Última actualización: hace X minutos" y advertencia de cambio de precio; añadir valor editorial propio sin copiar descripciones íntegras; sin scraping desde el navegador; estructurar el acceso a precios para integrar después una API oficial sin reescribir la UI
    - _Requisitos: R21.1, R21.2, R21.4, R21.5, R22.1, R22.3, R22.4_

- [x] 28. Páginas públicas restantes
  - [x] 28.1 Implementar `/amazon`, `/mercado-libre` y `/categorias/[slug]`
    - Listados filtrados por plataforma y por categoría reutilizando cuadrícula y filtros
    - _Requisitos: R10.1_
  - [x] 28.2 Implementar `/como-funciona`, `/transparencia-afiliados`, `/privacidad`, `/terminos` y `/contacto`
    - Página de transparencia que explique el enlace de afiliado, que el precio no aumenta, que precios/disponibilidad pueden cambiar, que el sitio no es Amazon ni Mercado Libre, cómo se seleccionan las ofertas, qué partes son automáticas y cómo reportar una oferta expirada
    - _Requisitos: R10.1, R21.3_

- [x] 29. Conmutador `SHOW_AMAZON_PRICES` en la UI
  - [x] 29.1 Implementar la ocultación de precios de Amazon según el conmutador
    - Cuando `SHOW_AMAZON_PRICES` está desactivado, ocultar los valores numéricos de precio de ofertas Amazon y mostrar "Consulta el precio actual en Amazon", exponiéndolo a los Client Components solo como booleano derivado
    - _Requisitos: R22.2_
  - [x]* 29.2 Escribir prueba de propiedad de ocultación de precios de Amazon
    - **Propiedad 24: Ocultación de precios de Amazon según conmutador**
    - **Validates: Requirements 22.2**

- [x] 30. SEO, datos estructurados e imagen Open Graph
  - [x] 30.1 Implementar metadatos, `sitemap`, `robots` y `manifest`
    - Metadatos globales y dinámicos por oferta, enlace canónico, Open Graph y Twitter cards usando `https://programadormx.online`; `sitemap.ts`, `robots.ts`, `manifest.ts` y favicon
    - _Requisitos: R20.1, R20.2, R20.8_
  - [x] 30.2 Implementar JSON-LD honesto
    - `BreadcrumbList`, `Organization`, `WebSite` y `SearchAction` siempre; `Product`/`Offer` solo cuando los datos sean reales y vigentes; excluir disponibilidad para ofertas expiradas; omitir el precio cuando no se garantice su exactitud
    - _Requisitos: R20.3, R20.4, R20.5, R20.6_
  - [x]* 30.3 Escribir prueba de propiedad de datos estructurados honestos
    - **Propiedad 20: Datos estructurados honestos**
    - **Validates: Requirements 20.4, 20.5, 20.6**
  - [x] 30.4 Implementar la imagen Open Graph dinámica
    - Generar con `next/og` una imagen por oferta con imagen, título, precio, descuento, marca discreta y fondo premium, legible en WhatsApp y Facebook
    - _Requisitos: R20.7_

- [x] 31. Punto de control — sitio público
  - Asegurar que todas las pruebas pasen; preguntar al usuario si surgen dudas.

- [x] 32. Investigación e integración de componentes React Bits
  - [x] 32.1 Investigar React Bits con Chrome DevTools y documentar
    - Usar Chrome DevTools para evaluar candidatos en reactbits.dev y escribir `docs/react-bits-research.md` con la tabla obligatoria (Componente, Uso considerado, Dependencias, Costo de rendimiento, Comportamiento móvil, Decisión y Justificación)
    - _Requisitos: R28.1, R28.2_
  - [x] 32.2 Integrar los componentes seleccionados
    - Adoptar solo los que aporten valor real adaptados a los tokens, con importación dinámica y Suspense localizado, gating de rendimiento/accesibilidad (`pointer: coarse`, `prefers-reduced-motion`, `Save-Data`, pausa fuera de pantalla) y respetando la lista de exclusión; GSAP solo donde lo requiera React Bits
    - _Requisitos: R28.3, R28.4, R18.3, R18.4, R18.5, R19.4, R19.5_

- [x] 33. Autenticación de administrador
  - [x] 33.1 Implementar la resolución de administrador por allowlist (lógica pura)
    - Seguir TDD: escribir primero pruebas (coincidencia sin distinción de mayúsculas con uno o varios correos separados por coma) que fallen, luego implementar el parseo de `ADMIN_EMAIL`
    - _Requisitos: R10.6_
  - [x]* 33.2 Escribir prueba de propiedad de resolución de administrador por allowlist
    - **Propiedad 22: Resolución de administrador por allowlist**
    - **Validates: Requirements 10.6**
  - [x] 33.3 Implementar el middleware y el inicio de sesión
    - `middleware.ts` con `@supabase/ssr` que refresca sesión y protege `/admin/**` y `/api/admin/**` (redirige a login o responde 401/403 si el correo no está en `ADMIN_EMAIL`); página de inicio de sesión; rutas admin fuera de la navegación pública
    - _Requisitos: R10.2, R10.4, R10.5_

- [x] 34. Panel de administración de ofertas
  - [x] 34.1 Implementar `/api/admin/offers` con auditoría
    - Endpoint de servidor que verifica la sesión de admin y usa el rol de servicio para editar, publicar, ocultar, expirar y destacar ofertas, registrando cada acción en `admin_audit_logs`
    - _Requisitos: R8.6, R7.7, R23.2, R10.3_
  - [x] 34.2 Implementar `AdminTable` y `AdminOfferEditor`
    - Tabla con búsqueda y filtros y acciones de gestión; editor para corregir título/categoría/imagen, revisar el resultado del parser, ver texto crudo y errores, reintentar imagen, revisar enlaces y verificar el tracking id, vista previa de tarjeta y de página, e historial de cambios desde `admin_audit_logs`; conectar las páginas `/admin`, `/admin/ofertas` y `/admin/ofertas/[id]`
    - _Requisitos: R23.2, R23.3, R23.4, R23.5, R4.15, R10.2_

- [x] 35. Modo "Probar mensaje" (TestMessagePanel)
  - Implementar `TestMessagePanel` con una Server Action que ejecuta el mismo parser y validador del webhook y muestra campos detectados, errores, advertencias y la oferta resultante sin persistir hasta una acción explícita
  - _Requisitos: R23.6_

- [x] 36. Vista de estado del webhook
  - Implementar `/admin/telegram` y `/api/admin/telegram/status` que ejecutan `getWebhookInfo` del lado servidor y muestran la última actualización recibida (de `telegram_updates`) y el conteo de errores recientes
  - _Requisitos: R23.5, R10.2, R10.3_

- [x] 37. Pase de accesibilidad (WCAG 2.2 AA)
  - [x] 37.1 Implementar las mejoras de accesibilidad
    - HTML semántico y orden de encabezados, enlace para saltar al contenido, foco visible, navegación completa por teclado, atrapado de foco y cierre con Escape en diálogos, no transmitir información esencial solo por color, elementos decorativos `aria-hidden` y sin contenido esencial dentro de `canvas`
    - _Requisitos: R25.1, R25.2, R25.3, R25.4, R25.5, R25.7_
  - [x]* 37.2 Escribir pruebas automatizadas de accesibilidad (axe)
    - Verificar contraste, etiquetas, nombres accesibles y ausencia de violaciones en las páginas principales
    - _Requisitos: R25.1, R25.3_

- [x] 38. Suite end-to-end con Playwright
  - [x] 38.1 Implementar fixtures, mocks y el emisor de Realtime simulado
    - Preparar datos sembrados, cliente de Supabase de prueba y un emisor de Realtime determinista (inyecta INSERT/UPDATE) sin depender del bot real ni de credenciales reales
    - _Requisitos: R29.4_
  - [x]* 38.2 Escribir los escenarios e2e
    - Cargar inicio, filtrar, buscar, abrir detalle, compartir, alternar tema, navegar en móvil, iniciar sesión como administrador, editar una oferta, expirar una oferta, recibir una actualización de Realtime simulada y ver una tarjeta nueva sin recargar
    - _Requisitos: R29.3_

- [x] 39. Auditoría de rendimiento con Chrome DevTools
  - Medir con Chrome DevTools LCP/CLS/INP y Lighthouse móvil en `/`, `/ofertas`, `/ofertas/[slug]` y `/admin` en los viewports requeridos; escribir `docs/performance-audit.md` con columnas Métrica inicial / Causa / Corrección / Métrica final; aplicar las correcciones de código necesarias (SSR de lista, `next/image`/`next/font`, lazy loading, precarga del LCP, importaciones dinámicas, consultas indexadas, paginación y caché)
  - _Requisitos: R19.1, R19.2, R19.3, R19.4, R19.5, R19.6_

- [x] 40. Entregables de documentación
  - [x] 40.1 Escribir `README.md` para despliegue desde cero
    - Cubrir requisitos, instalación, variables de entorno, Supabase, migraciones, storage, realtime, webhook de Telegram, registro del webhook, desarrollo local, pruebas, build, despliegue, seguridad y solución de problemas
    - _Requisitos: R30.2_
  - [x] 40.2 Escribir la documentación técnica restante
    - Crear `docs/architecture.md`, `docs/design-system.md`, `docs/telegram-integration.md`, `docs/database-schema.md`, `docs/security.md`, `docs/affiliate-compliance.md`, `docs/testing.md` y `docs/deployment.md`; documentar aquí las operaciones manuales (alta del proyecto Supabase, ejecución de migraciones y seeds, configuración de Storage/Realtime, registro del webhook, despliegue en Vercel y variables de entorno)
    - _Requisitos: R30.1_

- [x] 41. Punto de control final
  - Asegurar que todas las pruebas pasen y que la suite e2e, la auditoría de accesibilidad y la de rendimiento estén completas; preguntar al usuario si surgen dudas.

## Notas

- Las subtareas marcadas con `*` son opcionales (pruebas unitarias, de propiedad, de integración, e2e y de accesibilidad) y pueden omitirse para un MVP más rápido; las tareas de implementación principales nunca se marcan como opcionales.
- Cada subtarea referencia los identificadores de requisito que implementa para mantener la trazabilidad; los puntos de control no llevan requisitos.
- Las pruebas basadas en propiedades usan `fast-check` con un mínimo de 100 iteraciones por propiedad y se etiquetan con un comentario en el formato **`Feature: ofertas-reales-ia, Property {número}: {texto de la propiedad}`**, referenciando la propiedad del documento de diseño.
- Las pruebas nunca tocan el bot real ni credenciales reales: usan fixtures y mocks seguros (R29.4).
- Los módulos de lógica pura de `lib/` (dinero, parser, SSRF, identidad/deduplicación, estado de filtros, compuerta de efectos premium y allowlist de administrador) se desarrollan guiados por pruebas: primero las pruebas de ejemplo que fallan y luego la implementación.
- Las operaciones manuales (crear el proyecto Supabase, desplegar en Vercel, recolectar feedback) no son tareas de codificación: quedan documentadas en el entregable de documentación (tarea 40).
