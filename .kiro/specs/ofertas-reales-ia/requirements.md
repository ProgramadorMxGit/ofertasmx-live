# Documento de Requisitos

## Introducción

"Ofertas Reales IA" es una plataforma web premium de ofertas en tiempo real para el mercado mexicano. Un bot de Telegram recibe mensajes con ofertas; el sistema los valida, parsea, deduplica, almacena en una base de datos Supabase PostgreSQL y los muestra en un sitio web construido con Next.js (App Router, TypeScript en modo estricto) que se actualiza en tiempo casi real mediante Supabase Realtime. Los productos enlazan a Amazon México y Mercado Libre mediante enlaces de afiliado. El objetivo de despliegue es Vercel.

El producto prioriza, en este orden, las siguientes propiedades de diseño: seguridad > funcionalidad > claridad > accesibilidad > rendimiento > confianza > diseño visual > animación decorativa. La honestidad con el visitante es un principio rector: el sistema nunca inventa reseñas, existencias, contadores de urgencia, cifras de ventas, ahorros agregados ni afirmaciones de verificación humana que no sean ciertas.

Este documento define los requisitos funcionales y no funcionales en formato EARS. Las credenciales sensibles (token del bot, clave de rol de servicio, secreto del webhook) son secretos exclusivos del servidor y nunca aparecen como valores literales en este documento ni en el código del cliente; se referencian únicamente por el nombre de su variable de entorno.

## Glosario

- **Sistema**: La plataforma completa "Ofertas Reales IA", incluyendo backend, frontend, base de datos y procesos de servidor.
- **Endpoint del Webhook**: La ruta de API `/api/telegram/webhook` que recibe las actualizaciones de Telegram.
- **Script de Registro del Webhook**: El script `scripts/register-telegram-webhook.ts` que registra y consulta el webhook ante la API de Telegram.
- **Parser de Mensajes**: Componente de servidor que extrae y normaliza los campos de una oferta a partir del texto o pie de foto de Telegram.
- **Procesador de Imágenes**: Componente de servidor que selecciona, descarga, valida, optimiza y almacena imágenes provenientes de Telegram.
- **Validador de Dominios**: Componente que verifica que las URLs pertenezcan a la lista de dominios permitidos y aplica protecciones SSRF.
- **Motor de Deduplicación**: Componente que evita ofertas duplicadas según identificadores y huellas normalizadas.
- **Base de Datos**: La instancia de Supabase PostgreSQL con sus tablas, restricciones y políticas RLS.
- **Capa de Realtime**: El mecanismo de Supabase Realtime que propaga cambios de ofertas al frontend.
- **Sitio Web**: La aplicación Next.js (App Router) servida a los visitantes.
- **Servicio de Clics**: La ruta `/api/click/[offerId]` que valida ofertas, registra clics mínimos y redirige a enlaces de afiliado.
- **Panel de Administración**: Las páginas y APIs bajo `/admin` y `/api/admin` protegidas por Supabase Auth.
- **Administrador**: Usuario autenticado mediante Supabase Auth con permisos de gestión.
- **Visitante Público**: Usuario no autenticado que consulta el Sitio Web.
- **Chat Autorizado**: El chat de Telegram cuyo identificador (`chat.id`) es 5054325626.
- **Oferta**: Registro que representa un producto en descuento detectado a partir de un mensaje de Telegram.
- **Fingerprint**: Huella normalizada que identifica de forma estable un producto, compuesta por plataforma + identificador externo + título normalizado + destino normalizado.
- **ASIN**: Identificador de producto de Amazon.
- **MLM**: Identificador de producto de Mercado Libre.
- **Token del Bot**: Secreto del bot de Telegram almacenado únicamente en la variable de entorno `TELEGRAM_BOT_TOKEN`.

## Requisitos

### Requisito 1: Ingesta del webhook de Telegram

**Historia de usuario:** Como operador del Sistema, quiero recibir y validar de forma segura las actualizaciones de Telegram mediante un webhook, para que solo los mensajes legítimos del Chat Autorizado se procesen y nunca se filtren secretos.

#### Criterios de Aceptación

1. EL Endpoint del Webhook DEBERÁ aceptar únicamente solicitudes HTTP POST en la ruta `/api/telegram/webhook`.
2. SI una solicitud al Endpoint del Webhook usa un método distinto de POST ENTONCES el sistema DEBERÁ responder con el código HTTP 405 sin procesar el cuerpo.
3. CUANDO el Endpoint del Webhook recibe una solicitud ENTONCES el sistema DEBERÁ comparar el encabezado `X-Telegram-Bot-Api-Secret-Token` contra el valor de la variable de entorno `TELEGRAM_WEBHOOK_SECRET` usando una comparación de tiempo constante.
4. SI el encabezado `X-Telegram-Bot-Api-Secret-Token` no coincide con `TELEGRAM_WEBHOOK_SECRET` ENTONCES el sistema DEBERÁ rechazar la solicitud con el código HTTP 401 y omitir el procesamiento del cuerpo.
5. SI el cuerpo de la solicitud supera el tamaño máximo configurado ENTONCES el sistema DEBERÁ rechazar la solicitud con el código HTTP 413 antes de parsear el contenido.
6. CUANDO el cuerpo de la solicitud es recibido ENTONCES el sistema DEBERÁ validar su estructura con un esquema Zod antes de acceder a cualquier campo.
7. SI el cuerpo no cumple el esquema Zod ENTONCES el sistema DEBERÁ responder con el código HTTP 400 y registrar un evento técnico sin almacenar datos personales innecesarios.
8. EL Sistema DEBERÁ reconocer los tipos de actualización `message`, `edited_message`, `channel_post` y `edited_channel_post`.
9. CUANDO una actualización válida es recibida ENTONCES el sistema DEBERÁ extraer `update_id`, `message_id`, `chat.id`, `text`, `caption`, `photo`, `date`, `edit_date`, `entities` y `caption_entities`.
10. EL Sistema DEBERÁ procesar las ofertas únicamente cuando el `chat.id` de la actualización sea igual a 5054325626.
11. SI el `chat.id` de una actualización es distinto de 5054325626 ENTONCES el sistema DEBERÁ ignorarla de forma silenciosa, registrar únicamente un evento técnico y no almacenar datos personales innecesarios.
12. SI un `update_id` ya fue registrado como procesado ENTONCES el sistema DEBERÁ omitir su reprocesamiento y responder con el código HTTP 200.
13. SI un `message_id` dentro del Chat Autorizado ya generó un alta de Oferta ENTONCES el sistema DEBERÁ omitir crear una Oferta duplicada.
14. CUANDO una actualización válida del Chat Autorizado es aceptada ENTONCES el sistema DEBERÁ responder con el código HTTP 200 en un tiempo no mayor a 3 segundos.
15. SI ocurre un fallo interno durante el procesamiento ENTONCES el sistema DEBERÁ responder con un código HTTP 5xx para permitir un reintento seguro de Telegram sin duplicar efectos, apoyándose en la idempotencia por `update_id`.
16. EL Sistema DEBERÁ excluir el Token del Bot, el secreto del webhook y la clave de rol de servicio de todo registro (log) que genere.

### Requisito 2: Registro seguro del webhook

**Historia de usuario:** Como operador del Sistema, quiero registrar y consultar el webhook de Telegram mediante un script seguro, para que la configuración del webhook se realice sin exponer el Token del Bot ni habilitar endpoints públicos peligrosos.

#### Criterios de Aceptación

1. EL Script de Registro del Webhook DEBERÁ leer el Token del Bot exclusivamente desde la variable de entorno `TELEGRAM_BOT_TOKEN`.
2. CUANDO el Script de Registro del Webhook se ejecuta ENTONCES el sistema DEBERÁ registrar el webhook configurando el `secret_token` con el valor de `TELEGRAM_WEBHOOK_SECRET`.
3. CUANDO el webhook se registra ENTONCES el sistema DEBERÁ habilitar únicamente los tipos de actualización necesarios (`message`, `edited_message`, `channel_post`, `edited_channel_post`).
4. CUANDO el Script de Registro del Webhook muestra resultados ENTONCES el sistema DEBERÁ presentar el estado de la operación sin revelar el Token del Bot ni el `secret_token`.
5. EL Script de Registro del Webhook DEBERÁ permitir consultar el estado actual del webhook configurado.
6. EL Sistema DEBERÁ excluir cualquier endpoint público no protegido cuya función sea registrar o eliminar el webhook.
7. SI la variable `TELEGRAM_BOT_TOKEN` no está definida al ejecutar el Script de Registro del Webhook ENTONCES el sistema DEBERÁ abortar la operación con un mensaje de error claro.

### Requisito 3: Procesamiento de imágenes de Telegram

**Historia de usuario:** Como visitante, quiero ver imágenes de producto cargadas de forma confiable, para que cada oferta sea reconocible aunque la imagen original falle.

#### Criterios de Aceptación

1. CUANDO un mensaje incluye un arreglo `photo` ENTONCES el Procesador de Imágenes DEBERÁ seleccionar la fotografía de mayor resolución razonable disponible.
2. CUANDO se requiere descargar una imagen ENTONCES el Procesador de Imágenes DEBERÁ obtener el archivo mediante `getFile` desde el servidor sin exponer el Token del Bot al cliente.
3. CUANDO una imagen es descargada ENTONCES el Procesador de Imágenes DEBERÁ validar el tipo MIME, el tamaño máximo permitido, una extensión permitida y las dimensiones cuando sea posible.
4. SI una imagen no cumple las validaciones de tipo, tamaño, extensión o dimensiones ENTONCES el sistema DEBERÁ rechazar el archivo y registrar el motivo.
5. CUANDO una imagen válida se va a almacenar ENTONCES el Procesador de Imágenes DEBERÁ generar un nombre de archivo seguro y subirla a Supabase Storage.
6. CUANDO una imagen se almacena ENTONCES el sistema DEBERÁ guardar una URL estable que nunca contenga el Token del Bot ni sea una URL temporal de Telegram.
7. DONDE se requieran variantes optimizadas el Procesador de Imágenes DEBERÁ generar dichas variantes y el Sitio Web DEBERÁ renderizarlas mediante el componente `next/image`.
8. SI la descarga o el almacenamiento de una imagen falla ENTONCES el sistema DEBERÁ guardar la Oferta con una imagen de respaldo (fallback), registrar el error y habilitar el reintento desde el Panel de Administración.

### Requisito 4: Parseo y normalización de mensajes

**Historia de usuario:** Como editor de contenido, quiero que el Sistema interprete con tolerancia los mensajes de Telegram, para que las ofertas se extraigan correctamente pese a variaciones de formato y nunca se inventen datos.

#### Criterios de Aceptación

1. CUANDO el Parser de Mensajes recibe un texto ENTONCES el sistema DEBERÁ normalizar espacios unicode, saltos de línea, caracteres invisibles, URLs, moneda, decimales y porcentajes antes de extraer campos.
2. EL Parser de Mensajes DEBERÁ tolerar diferencias de mayúsculas, espacios extra, separadores de miles, precios con o sin centavos, los símbolos "$" y "MXN", emojis variados, una o varias líneas en blanco entre campos, URLs cortas o largas, parámetros UTM y caracteres de enlace escapados.
3. EL Parser de Mensajes DEBERÁ procesar tanto el `text` como el `caption` de un mensaje, así como mensajes editados y títulos de varias líneas.
4. CUANDO el Parser de Mensajes procesa un mensaje ENTONCES el sistema DEBERÁ extraer al menos los campos: `title`, `original_price`, `current_price`, `discount_percent`, `affiliate_url`, `merchant`, `platform`, `external_product_id`, `raw_text`, `telegram_message_id`, `telegram_update_id` y `published_at`.
5. CUANDO el Parser de Mensajes analiza el contenido ENTONCES el sistema DEBERÁ detectar la primera URL válida que pertenezca a un comercio permitido como enlace de la Oferta.
6. CUANDO el Parser de Mensajes determina el título ENTONCES el sistema DEBERÁ tomar el texto previo a la primera línea promocional.
7. CUANDO existan precio original y precio actual ENTONCES el sistema DEBERÁ recalcular el porcentaje real usando aritmética decimal exacta (no flotante) con la fórmula `descuento = ((original - actual) / original) * 100`.
8. CUANDO la diferencia absoluta entre el porcentaje escrito y el porcentaje calculado es menor o igual a 1 punto porcentual ENTONCES el sistema DEBERÁ corregir en silencio el valor al porcentaje calculado.
9. SI la diferencia absoluta entre el porcentaje escrito y el porcentaje calculado es mayor a 1 punto porcentual ENTONCES el sistema DEBERÁ conservar el porcentaje calculado y marcar la Oferta con `needs_review`.
10. SI un precio es negativo o absurdo ENTONCES el sistema DEBERÁ rechazar la Oferta.
11. SI el precio actual es mayor o igual al precio original Y existe un precio original ENTONCES el sistema DEBERÁ rechazar la Oferta.
12. DONDE no exista un precio original el sistema DEBERÁ permitir la Oferta sin calcular un porcentaje de descuento.
13. EL Parser de Mensajes DEBERÁ omitir la creación de cualquier campo cuyo dato no esté presente en el mensaje, sin inventar valores.
14. CUANDO el Parser de Mensajes crea una Oferta ENTONCES el sistema DEBERÁ asignar una categoría mediante clasificación automática por palabras clave en el título, asignando la categoría `Otros` cuando ninguna palabra clave coincida.
15. EL Administrador DEBERÁ poder corregir, desde el Panel de Administración, la categoría asignada automáticamente.

### Requisito 5: Dominios permitidos y protección SSRF

**Historia de usuario:** Como responsable de seguridad, quiero que el Sistema solo procese URLs de comercios confiables con protecciones SSRF, para que ninguna entrada de Telegram provoque solicitudes a destinos arbitrarios o internos.

#### Criterios de Aceptación

1. EL Validador de Dominios DEBERÁ mantener una lista de dominios permitidos configurable que inicialmente reconozca `amazon.com.mx`, `www.amazon.com.mx`, `amzn.to`, `mercadolibre.com.mx`, `www.mercadolibre.com.mx` y `meli.la`.
2. SI una URL no pertenece a la lista de dominios permitidos ENTONCES el sistema DEBERÁ rechazarla y no realizar ninguna solicitud hacia ella.
3. SI una URL no usa el esquema HTTPS, apunta a `localhost`, a una dirección IP privada o reservada, a un endpoint de metadatos de nube, o contiene credenciales embebidas ENTONCES el Validador de Dominios DEBERÁ rechazarla.
4. CUANDO el Validador de Dominios resuelve una URL ENTONCES el sistema DEBERÁ limitar el número de redirecciones permitidas, aplicar un tiempo límite (timeout) y un tamaño máximo de respuesta, y verificar que el dominio final siga estando permitido.
5. CUANDO se procesa una URL de Amazon ENTONCES el sistema DEBERÁ detectar el ASIN a partir de rutas `/dp/`, `/gp/product/` o parámetros válidos.
6. EL Sistema DEBERÁ preservar el parámetro de afiliado (tag) presente en las URLs de Amazon sin reemplazarlo silenciosamente por uno de un tercero.
7. DONDE aplique verificar el identificador de afiliado de Amazon el sistema DEBERÁ comparar el tag con `AMAZON_TRACKING_ID` (valor por defecto `programadormx-20`).
8. SI el tag de afiliado de Amazon no coincide con el identificador esperado ENTONCES el sistema DEBERÁ marcar la Oferta para revisión sin alterar el enlace original.
9. CUANDO se procesa una URL de Mercado Libre ENTONCES el sistema DEBERÁ detectar el identificador MLM cuando esté disponible, preservar un enlace de afiliado válido y conservar los parámetros de atribución.

### Requisito 6: Modelo de base de datos y migraciones

**Historia de usuario:** Como desarrollador, quiero un esquema de base de datos versionado con restricciones de integridad, para que los datos de ofertas, actualizaciones y auditoría sean consistentes y verificables.

#### Criterios de Aceptación

1. EL Sistema DEBERÁ definir el esquema mediante migraciones SQL versionadas para las tablas `offers`, `telegram_updates`, `offer_clicks`, `offer_categories` y `admin_audit_logs`.
2. EL Sistema DEBERÁ definir la tabla `offers` con al menos los campos: `id` UUID (clave primaria), `platform`, `merchant`, `external_product_id`, `fingerprint`, `telegram_chat_id` BIGINT, `telegram_message_id` BIGINT, `telegram_update_id` BIGINT, `title`, `slug`, `short_description`, `editorial_summary`, `image_url`, `image_storage_path`, `image_alt`, `original_price` NUMERIC(12,2), `current_price` NUMERIC(12,2), `discount_percent` INTEGER, `currency` TEXT con valor por defecto `'MXN'`, `affiliate_url`, `category_id`, `status`, `is_featured` BOOLEAN, `needs_review` BOOLEAN, `raw_text`, `published_at`, `updated_at`, `last_verified_at`, `expires_at` y `created_at`.
3. EL Sistema DEBERÁ restringir el campo `status` de `offers` a los valores `draft`, `active`, `expired`, `hidden`, `rejected` y `needs_review`.
4. EL Sistema DEBERÁ imponer que el campo `slug` de `offers` sea único.
5. EL Sistema DEBERÁ crear un índice sobre el campo `fingerprint` y un índice sobre la combinación (`platform`, `external_product_id`).
6. EL Sistema DEBERÁ imponer que `telegram_message_id` sea único dentro del Chat Autorizado.
7. EL Sistema DEBERÁ imponer las restricciones `current_price >= 0`, `original_price >= 0` y `discount_percent` entre 0 y 100.
8. SI una Oferta tiene `status = 'active'` ENTONCES el sistema DEBERÁ exigir que exista una `affiliate_url`.
9. EL Sistema DEBERÁ definir la tabla `telegram_updates` con `update_id` BIGINT como clave primaria y los campos `message_id`, `chat_id`, `update_type`, `payload` JSONB, `processing_status`, `error_message`, `received_at` y `processed_at`.
10. EL Sistema DEBERÁ conservar el campo `payload` JSONB de `telegram_updates` únicamente durante el tiempo necesario para depuración.
11. EL Sistema DEBERÁ definir la tabla `offer_clicks` únicamente con analítica mínima (`id`, `offer_id`, `source`, `referrer_domain`, `created_at`), sin almacenar direcciones IP completas salvo justificación legal ni técnicas de fingerprinting invasivas.
12. EL Sistema DEBERÁ permitir que el campo `expires_at` de `offers` sea nulo, lo que indica que la Oferta no caduca por el paso del tiempo salvo acción del Administrador.

### Requisito 7: Deduplicación de ofertas

**Historia de usuario:** Como editor de contenido, quiero que las ofertas repetidas se actualicen en lugar de duplicarse, para que el catálogo se mantenga limpio y refleje precios al día.

#### Criterios de Aceptación

1. CUANDO el Motor de Deduplicación evalúa una Oferta ENTONCES el sistema DEBERÁ aplicar, en orden de prioridad, los criterios: plataforma más identificador externo, ASIN para Amazon, MLM para Mercado Libre, `telegram_message_id` y, por último, el Fingerprint normalizado.
2. EL Sistema DEBERÁ calcular el Fingerprint como la combinación de plataforma + `external_product_id` + título normalizado + destino normalizado.
3. SI una Oferta corresponde a un producto ya existente ENTONCES el sistema DEBERÁ omitir insertar un nuevo registro y, en su lugar, actualizar el precio, el descuento y la fecha del registro existente.
4. CUANDO una Oferta existente se actualiza ENTONCES el sistema DEBERÁ conservar el historial cuando resulte útil y registrar la actualización.
5. CUANDO una Oferta existente se actualiza ENTONCES el sistema DEBERÁ notificar a la Capa de Realtime el cambio como una actualización y no como un producto nuevo.
6. CUANDO se recibe un `edited_message` de una Oferta existente ENTONCES el sistema DEBERÁ actualizar el registro correspondiente sin generar un nuevo `slug` ni duplicar la imagen innecesariamente.
7. CUANDO se procesa un `edited_message` ENTONCES el sistema DEBERÁ escribir una entrada en `admin_audit_logs`.

### Requisito 8: Seguridad de datos con RLS de Supabase

**Historia de usuario:** Como responsable de seguridad, quiero políticas estrictas de Row Level Security, para que los visitantes solo vean datos públicos y los secretos del servidor nunca lleguen al navegador.

#### Criterios de Aceptación

1. EL Sistema DEBERÁ habilitar Row Level Security (RLS) en todas las tablas con datos sensibles.
2. EL Visitante Público DEBERÁ poder leer únicamente las Ofertas cuyo `status` sea `active`.
3. SI un Visitante Público intenta insertar, editar o eliminar Ofertas ENTONCES el sistema DEBERÁ denegar la operación.
4. SI un Visitante Público intenta leer payloads crudos, registros (logs) o datos administrativos ENTONCES el sistema DEBERÁ denegar el acceso.
5. CUANDO un proceso de servidor gestiona Ofertas ENTONCES el sistema DEBERÁ operar mediante la clave `SUPABASE_SERVICE_ROLE_KEY` exclusiva del servidor.
6. EL Administrador autenticado DEBERÁ poder leer todas las tablas, editar Ofertas, cambiar estados, marcar destacadas, corregir categorías, reintentar imágenes, ver errores técnicos y consultar `admin_audit_logs`.
7. EL Sistema DEBERÁ excluir la clave `SUPABASE_SERVICE_ROLE_KEY` del bundle servido al navegador.

### Requisito 9: Actualizaciones en tiempo real (Realtime)

**Historia de usuario:** Como visitante, quiero ver cambios de ofertas en tiempo casi real sin recargar, para que la experiencia sea fluida aunque la conexión en vivo no esté disponible.

#### Criterios de Aceptación

1. CUANDO el Sitio Web realiza la primera carga ENTONCES el sistema DEBERÁ obtener las Ofertas desde el servidor, de modo que la página funcione completamente aun sin la Capa de Realtime.
2. CUANDO la Capa de Realtime notifica una Oferta nueva ENTONCES el Sitio Web DEBERÁ insertar la tarjeta en la posición correcta con una animación de entrada breve y un aviso discreto "Nueva oferta encontrada".
3. CUANDO se inserta una Oferta nueva por Realtime ENTONCES el sistema DEBERÁ evitar reproducir sonido automático, robar el foco o provocar saltos de desplazamiento si el visitante está leyendo en otra parte.
4. CUANDO la Capa de Realtime notifica una Oferta actualizada ENTONCES el Sitio Web DEBERÁ actualizar el precio y el descuento, resaltar brevemente el campo modificado y no volver a montar toda la cuadrícula.
5. CUANDO la Capa de Realtime notifica una Oferta expirada ENTONCES el Sitio Web DEBERÁ retirarla de la lista principal.
6. CUANDO un visitante abre la página de detalle de una Oferta expirada ENTONCES el sistema DEBERÁ mostrar el aviso "Esta oferta podría haber terminado" y recomendar ofertas relacionadas.
7. SI la conexión de Realtime se pierde ENTONCES el Sitio Web DEBERÁ mostrar un indicador discreto "Reconectando…" e intentar reconectar con retroceso exponencial (exponential backoff).
8. CUANDO la conexión de Realtime se restablece ENTONCES el sistema DEBERÁ ejecutar una resincronización para recuperar los eventos perdidos durante la desconexión.
9. MIENTRAS una Oferta no tenga definido `expires_at`, el sistema NO DEBERÁ marcarla como `expired` automáticamente por el paso del tiempo.
10. CUANDO una Oferta tiene `expires_at` y esa fecha ya transcurrió ENTONCES un proceso programado DEBERÁ marcarla como `expired` y propagar el cambio mediante la Capa de Realtime.

### Requisito 10: Rutas y control de acceso

**Historia de usuario:** Como visitante y como administrador, quiero rutas públicas y administrativas bien delimitadas, para que el contenido público sea accesible y el panel de administración permanezca protegido y oculto.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ exponer las páginas públicas `/`, `/ofertas`, `/ofertas/[slug]`, `/amazon`, `/mercado-libre`, `/categorias/[slug]`, `/como-funciona`, `/transparencia-afiliados`, `/privacidad`, `/terminos` y `/contacto`.
2. EL Sitio Web DEBERÁ exponer las páginas administrativas `/admin`, `/admin/ofertas`, `/admin/ofertas/[id]` y `/admin/telegram`.
3. EL Sistema DEBERÁ exponer las rutas de API `/api/telegram/webhook`, `/api/offers`, `/api/offers/[id]`, `/api/click/[offerId]`, `/api/admin/offers` y `/api/admin/telegram/status`.
4. SI un usuario no autenticado intenta acceder a una página o API bajo `/admin` o `/api/admin` ENTONCES el sistema DEBERÁ denegar el acceso o redirigir al inicio de sesión mediante Supabase Auth.
5. EL Sistema DEBERÁ excluir todas las rutas administrativas de la navegación pública.
6. EL Sistema DEBERÁ considerar Administrador únicamente al usuario autenticado mediante Supabase Auth cuyo correo electrónico coincida con alguno de los valores configurados en `ADMIN_EMAIL`, admitiendo uno o varios correos separados por coma.

### Requisito 11: Seguimiento de clics y enlaces externos

**Historia de usuario:** Como responsable de afiliados, quiero que los clics a comercios pasen por un redirector seguro, para que se registre analítica mínima y se preserve el enlace de afiliado sin riesgos de redirección abierta.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ renderizar el botón de compra externo con el atributo `rel="sponsored nofollow noopener"`.
2. CUANDO un visitante activa un botón de compra ENTONCES el sistema DEBERÁ encaminar el clic a través de `/api/click/[offerId]`.
3. CUANDO el Servicio de Clics recibe una solicitud ENTONCES el sistema DEBERÁ validar que la Oferta exista antes de redirigir.
4. CUANDO el Servicio de Clics procesa un clic válido ENTONCES el sistema DEBERÁ registrar analítica mínima y redirigir con el código HTTP de redirección apropiado preservando la `affiliate_url` intacta.
5. EL Servicio de Clics DEBERÁ excluir cualquier destino proporcionado por el cliente y redirigir únicamente al enlace de afiliado almacenado en la Oferta, evitando redirecciones abiertas.
6. SI el `offerId` no corresponde a una Oferta válida ENTONCES el sistema DEBERÁ responder con un error sin realizar ninguna redirección.

### Requisito 12: Marca, sistema visual y tipografía

**Historia de usuario:** Como visitante, quiero una identidad visual profesional y coherente, para que la plataforma transmita confianza con una experiencia premium y legible.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ presentar la marca "Ofertas Reales IA" con una identidad visual propia que no use un emoji de robot o fuego como logotipo dominante.
2. EL Sistema DEBERÁ proveer una marca tipográfica (símbolo abstracto de señal, radar, pulso o etiqueta, o un monograma "OR") compatible con favicon y avatar social, e incluir los recursos `logo.svg`, `mark.svg`, `favicon.svg` y `apple-touch-icon`.
3. EL Sitio Web DEBERÁ implementar un diseño "dark-first" con un modo claro plenamente funcional que no sea una simple inversión de colores.
4. EL Sistema DEBERÁ definir una paleta y tokens de diseño semánticos: `--background`, `--foreground`, `--surface`, `--surface-elevated`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--success`, `--warning`, `--danger` y `--focus-ring`.
5. EL Sistema DEBERÁ evitar colores hexadecimales dispersos en el código, usando los tokens de diseño definidos.
6. EL Sitio Web DEBERÁ cargar la tipografía mediante `next/font`, usando Geist Sans para la interfaz, Instrument Serif como acento editorial limitado y números tabulares para precios, descuentos y estadísticas.
7. EL Sistema DEBERÁ definir una escala tipográfica fluida con `clamp()` que se mantenga legible en dispositivos Android de gama baja.

### Requisito 13: Estructura de la página de inicio

**Historia de usuario:** Como visitante, quiero una página de inicio editorial y honesta, para que pueda explorar ofertas en vivo y entender el servicio sin afirmaciones falsas.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ mostrar un encabezado fijo (sticky) con estado inicial transparente que, tras el desplazamiento, cambie a una superficie oscura semitransparente con desenfoque moderado, borde inferior delgado, sombra sutil y altura ligeramente reducida.
2. EL encabezado DEBERÁ contener la navegación (Ofertas, Amazon, Mercado Libre, Categorías, Cómo funciona), un CTA de WhatsApp "Unirme al grupo", un conmutador de tema y un botón de búsqueda.
3. EL Sitio Web DEBERÁ ofrecer un menú móvil accesible con áreas táctiles de al menos 44px que no dependa del estado hover.
4. EL Sitio Web DEBERÁ mostrar un hero editorial asimétrico con insignia, H1, texto de apoyo, CTA primario "Ver ofertas en vivo", CTA secundario "Unirme por WhatsApp" y una composición visual de 2 a 3 tarjetas de oferta de demostración con un indicador de flujo en vivo y una tarjeta entrante animada.
5. EL Sitio Web DEBERÁ mostrar una barra de confianza únicamente con indicadores honestos (actualización en tiempo real, enlaces verificados, Amazon y Mercado Libre, gratis para compradores).
6. EL Sistema DEBERÁ excluir de la barra de confianza cualquier cifra inventada de usuarios, ventas o ahorros.
7. EL Sitio Web DEBERÁ mostrar una sección de ofertas en vivo con indicador de conexión, hora de última actualización, filtros, búsqueda, ordenamiento, vista de cuadrícula o lista, esqueletos (skeletons), estados vacíos y carga progresiva.
8. EL Sitio Web DEBERÁ presentar una sección de destacados como cuadrícula editorial asimétrica en escritorio y, cuando sea razonable, un carrusel solo en móvil, sin rotación automática.
9. EL Sitio Web DEBERÁ incluir la sección "Cómo funciona" con tres pasos (Detectamos, Verificamos, Publicamos) que sean honestos sobre qué partes del proceso son automáticas, sin afirmar verificación humana si no es cierta.
10. EL Sitio Web DEBERÁ incluir un bloque de transparencia sobre enlaces de afiliado y un CTA final de WhatsApp sin temporizadores falsos ni escasez inventada.
11. EL Sitio Web DEBERÁ mostrar un pie de página (footer) con los enlaces de las páginas públicas definidas.

### Requisito 14: Componente de tarjeta de oferta

**Historia de usuario:** Como visitante, quiero tarjetas de oferta claras y accesibles, para que pueda comparar precios y descuentos de un vistazo y actuar sin depender del hover.

#### Criterios de Aceptación

1. EL componente de tarjeta de Oferta DEBERÁ incluir imagen, plataforma, estado en vivo, título, descuento, precio original tachado mediante un elemento semántico `<del>`, precio actual con números tabulares, ahorro absoluto cuando sea calculable, hora de publicación, hora de última verificación, un botón primario evidente sin hover y una acción de compartir.
2. EL componente de tarjeta de Oferta DEBERÁ representar los estados "nueva" y "expirada".
3. EL componente de tarjeta de Oferta DEBERÁ aplicar la jerarquía visual: precio actual > descuento > producto > imagen > precio original > metadatos.
4. DONDE la tarjeta sea destacada, esté en la primera fila y se use en escritorio con puntero preciso el sistema DEBERÁ aplicar efectos premium sutiles (foco, reflejo o resplandor de borde localizado).
5. SI el dispositivo usa `pointer: coarse`, tiene activado `prefers-reduced-motion: reduce` o activa `Save-Data` ENTONCES el sistema DEBERÁ desactivar los efectos premium.
6. EL componente de tarjeta de Oferta DEBERÁ usar un radio de borde entre 18px y 24px, borde sutil, una elevación máxima en hover de 2px a 4px, una escala máxima de 1.01 y `object-fit: contain` para la imagen.
7. EL componente de tarjeta de Oferta DEBERÁ cumplir con accesibilidad completa, incluyendo nombre accesible del botón y texto alternativo de la imagen.

### Requisito 15: Página de detalle de oferta

**Historia de usuario:** Como visitante, quiero una página de detalle completa y honesta, para que pueda decidir con información verificada sin elementos engañosos.

#### Criterios de Aceptación

1. LA página `/ofertas/[slug]` DEBERÁ mostrar migas de pan (breadcrumbs), plataforma, título, imagen optimizada, precio actual, precio original, descuento, ahorro, estado, hora de detección, hora de actualización y un CTA claro con un aviso de afiliado contiguo.
2. LA página de detalle DEBERÁ mostrar una descripción editorial, características cuando estén presentes, consideraciones, ofertas relacionadas y un botón de compartir.
3. CUANDO una Oferta está expirada ENTONCES la página de detalle DEBERÁ mostrar el estado expirado.
4. EL Sistema DEBERÁ excluir de la página de detalle reseñas inventadas, existencias inventadas, cantidades falsas, indicadores de "personas comprando ahora" falsos, cuentas regresivas falsas e insignias de "verificado" sin fundamento.

### Requisito 16: Filtros y búsqueda

**Historia de usuario:** Como visitante, quiero filtrar, ordenar y buscar ofertas con estado reflejado en la URL, para que pueda compartir y retomar resultados con navegación correcta.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ ofrecer filtros por plataforma (Todas, Amazon, Mercado Libre) y por categoría (Electrónica, Hogar, Moda, Herramientas, Oficina, Belleza, Deportes, Otros).
2. EL Sitio Web DEBERÁ ofrecer filtros adicionales de descuento mínimo, rango de precio y ordenamiento por más recientes, mayor descuento o menor precio.
3. CUANDO un visitante cambia un filtro, el rango o el orden ENTONCES el sistema DEBERÁ reflejar la selección en la URL (por ejemplo `/ofertas?platform=amazon&minDiscount=50&sort=recent`).
4. CUANDO un visitante usa el botón "atrás" del navegador ENTONCES el sistema DEBERÁ restaurar el estado de filtros previo a partir de la URL.
5. CUANDO un visitante escribe en la búsqueda ENTONCES el sistema DEBERÁ aplicar un retardo (debounce), buscar en el título y la plataforma y resaltar de forma discreta las coincidencias.
6. SI una búsqueda no arroja resultados ENTONCES el sistema DEBERÁ mostrar un estado de "sin resultados".
7. CUANDO un visitante pulsa la tecla "/" o la combinación Ctrl/Cmd+K fuera de un campo de formulario ENTONCES el sistema DEBERÁ abrir la búsqueda sin interferir con los campos de formulario.

### Requisito 17: Experiencia móvil

**Historia de usuario:** Como visitante en móvil, quiero un diseño optimizado y táctil, para que la plataforma sea cómoda y rápida en pantallas pequeñas.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ aplicar un diseño mobile-first verificado en los anchos 360x800, 390x844 y 412x915 y adaptarse después a 768, 1024, 1280, 1440 y 1920.
2. CUANDO el Sitio Web se muestra en móvil ENTONCES el sistema DEBERÁ usar una sola columna, encabezado compacto, filtros en un cajón (drawer) y botones de al menos 44px.
3. EL Sitio Web DEBERÁ evitar en móvil los efectos dependientes del ratón, el desbordamiento horizontal y los fondos WebGL innecesarios, y servir imágenes optimizadas.
4. DONDE se incluya una barra inferior opcional el sistema DEBERÁ ofrecer los accesos Inicio, Ofertas, Buscar y WhatsApp.
5. EL Sistema DEBERÁ evitar mostrar simultáneamente un menú superior complejo y una barra inferior redundante.

### Requisito 18: Sistema de animaciones

**Historia de usuario:** Como visitante, quiero animaciones fluidas y respetuosas, para que la interfaz se sienta premium sin afectar el rendimiento ni la accesibilidad.

#### Criterios de Aceptación

1. EL Sistema DEBERÁ definir tokens de duración: instantáneo (100-140ms), rápido (160-220ms), normal (240-320ms) y editorial (450-650ms), con la curva de easing principal `cubic-bezier(0.22, 1, 0.36, 1)`.
2. EL Sistema DEBERÁ animar únicamente las propiedades `opacity` y `transform`, evitando animar `width`, `height`, `top` o `left`.
3. EL Sistema DEBERÁ evitar desenfoques grandes en listas largas, el thrashing de layout y limitar (throttle) el evento `mousemove` mediante `requestAnimationFrame`.
4. CUANDO un elemento animado está fuera de pantalla o en una pestaña oculta ENTONCES el sistema DEBERÁ pausar su animación.
5. SI el visitante tiene activado `prefers-reduced-motion: reduce` ENTONCES el sistema DEBERÁ eliminar parallax, seguimiento de cursor y rotaciones, conservando cambios de opacidad instantáneos y toda la funcionalidad.
6. EL Sistema DEBERÁ mostrar el contenido principal sin retrasarlo por animaciones, sin preloader obligatorio, garantizando que la animación del H1 no retrase el LCP y que el texto principal sea visible en aproximadamente 150ms.

### Requisito 19: Objetivos de rendimiento

**Historia de usuario:** Como visitante, quiero que el sitio cargue rápido y sea estable, para que la experiencia sea ágil incluso en redes y dispositivos limitados.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ alcanzar un LCP menor a 2.5s, un CLS menor a 0.1 y un INP menor a 200ms en condiciones móviles representativas.
2. EL Sitio Web DEBERÁ obtener en Lighthouse móvil puntuaciones de Performance >= 90, Accesibilidad >= 95, Best Practices >= 95 y SEO >= 95.
3. EL Sitio Web DEBERÁ renderizar la lista inicial mediante SSR y usar `next/image`, `next/font` con los subconjuntos necesarios e imágenes responsivas.
4. EL Sitio Web DEBERÁ aplicar carga diferida (lazy loading) por debajo del pliegue, precargar únicamente el recurso del LCP y usar importaciones dinámicas para componentes pesados.
5. EL Sistema DEBERÁ diferir la carga de cualquier componente WebGL y usar Suspense localizado.
6. EL Sistema DEBERÁ usar consultas SQL indexadas, paginación, caché apropiada, Server Components por defecto y Client Components solo cuando exista interacción real.

### Requisito 20: SEO y redes sociales

**Historia de usuario:** Como responsable de marketing, quiero metadatos y datos estructurados correctos y honestos, para que las ofertas se compartan bien sin marcar como disponibles ofertas expiradas.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ generar metadatos globales, metadatos dinámicos por Oferta, enlace canónico, etiquetas Open Graph y Twitter cards.
2. EL Sitio Web DEBERÁ generar `sitemap`, `robots`, `manifest` y favicon.
3. EL Sitio Web DEBERÁ incluir los esquemas JSON-LD Breadcrumb, Organization, WebSite y SearchAction.
4. DONDE los datos de una Oferta sean reales y vigentes el sistema DEBERÁ incluir el esquema Product/Offer.
5. SI una Oferta está expirada ENTONCES el sistema DEBERÁ excluirla de ser marcada como disponible en datos estructurados.
6. SI no se puede garantizar la exactitud del precio ENTONCES el sistema DEBERÁ omitir el precio en los datos estructurados.
7. CUANDO se comparte una Oferta ENTONCES el sistema DEBERÁ generar una imagen Open Graph dinámica con imagen, título, precio, descuento, marca discreta y fondo premium, legible en WhatsApp y Facebook.
8. EL Sitio Web DEBERÁ usar `https://programadormx.online` como URL del sitio en los metadatos y enlaces canónicos.

### Requisito 21: Cumplimiento de afiliados y valor editorial

**Historia de usuario:** Como visitante, quiero divulgaciones claras de afiliados y contenido editorial propio, para que entienda el modelo del sitio y confíe en la información.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ mostrar las divulgaciones "Como Afiliado de Amazon, gano por compras elegibles." y una divulgación general de enlaces de afiliado.
2. EL Sitio Web DEBERÁ mostrar una etiqueta breve "Enlace de afiliado" cerca de los botones externos.
3. EL Sitio Web DEBERÁ proveer la página `/transparencia-afiliados` que explique qué es un enlace de afiliado, que el precio para el usuario no aumenta, que los precios y la disponibilidad pueden cambiar, que el sitio no es Amazon ni Mercado Libre, cómo se seleccionan las ofertas, qué partes del proceso son automáticas y cómo reportar una oferta expirada.
4. EL Sistema DEBERÁ excluir la copia íntegra de descripciones de los comercios, añadiendo valor editorial propio (resúmenes, contexto, categorías útiles, comparación con el precio anterior, hora de detección y advertencias).
5. EL Sistema DEBERÁ excluir la generación automática de afirmaciones no verificadas, permitiendo que los campos editoriales permanezcan pendientes de revisión del Administrador.

### Requisito 22: Tratamiento de precios

**Historia de usuario:** Como visitante, quiero información de precios honesta y actualizada, para que entienda que los valores pueden cambiar en el comercio y no se realice scraping desde el navegador.

#### Criterios de Aceptación

1. CUANDO el Sitio Web muestra un precio ENTONCES el sistema DEBERÁ presentar "Última actualización: hace X minutos" y una advertencia de que el precio y la disponibilidad pueden cambiar en el comercio.
2. DONDE la configuración `SHOW_AMAZON_PRICES` esté desactivada el sistema DEBERÁ ocultar los precios de Amazon y mostrar en su lugar "Consulta el precio actual en Amazon".
3. EL Sistema DEBERÁ excluir cualquier scraping ejecutado desde el navegador del visitante.
4. EL Sistema DEBERÁ disponer de una arquitectura que permita integrar posteriormente una API oficial de producto sin reescribir la interfaz.

### Requisito 23: Panel de administración

**Historia de usuario:** Como administrador, quiero un panel protegido para gestionar ofertas y el webhook, para que pueda revisar, corregir y publicar contenido y probar mensajes sin publicarlos.

#### Criterios de Aceptación

1. EL Panel de Administración DEBERÁ estar protegido por Supabase Auth y permanecer fuera de la navegación pública.
2. EL Panel de Administración DEBERÁ mostrar una tabla de Ofertas con búsqueda y filtros, y permitir editar, publicar, ocultar, expirar y destacar Ofertas.
3. EL Panel de Administración DEBERÁ permitir corregir título, categoría e imagen, revisar el resultado del parser, ver el texto crudo y los errores, y reintentar el procesamiento.
4. EL Panel de Administración DEBERÁ permitir revisar enlaces, verificar el identificador de afiliado (tracking id) y ofrecer vista previa de la tarjeta y de la página.
5. EL Panel de Administración DEBERÁ mostrar el historial de cambios, el estado del webhook, la última actualización recibida y el conteo de errores recientes.
6. CUANDO un Administrador usa el modo "Probar mensaje" pegando un mensaje de Telegram ENTONCES el sistema DEBERÁ mostrar los campos detectados, los errores, las advertencias y la Oferta resultante sin publicarla hasta una acción explícita.

### Requisito 24: Datos de demostración (seeds)

**Historia de usuario:** Como desarrollador, quiero datos de demostración representativos y claramente ficticios, para que el diseño completo pueda probarse sin credenciales reales ni datos engañosos.

#### Criterios de Aceptación

1. EL Sistema DEBERÁ proveer seeds visuales con productos ficticios o claramente marcados como demostración.
2. EL Sistema DEBERÁ excluir de los seeds marcas o precios reales presentados como vigentes de forma engañosa.
3. EL conjunto de seeds DEBERÁ cubrir los estados: activa, recién publicada, destacada, sin precio original, expirada y `needs_review`, así como Ofertas de Amazon, de Mercado Libre y una Oferta sin imagen.

### Requisito 25: Accesibilidad (WCAG 2.2 AA)

**Historia de usuario:** Como visitante que usa tecnología de asistencia, quiero una interfaz accesible, para que pueda navegar y comprender el contenido con teclado y lectores de pantalla.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ usar HTML semántico, orden de encabezados correcto, un enlace para saltar al contenido (skip link) y foco visible.
2. EL Sitio Web DEBERÁ permitir la navegación completa por teclado.
3. EL Sitio Web DEBERÁ proveer contraste adecuado, etiquetas, mensajes de error asociados, texto alternativo y nombres accesibles para los botones.
4. CUANDO se abre un diálogo modal ENTONCES el sistema DEBERÁ atrapar el foco dentro del diálogo y permitir cerrarlo con la tecla Escape.
5. EL Sistema DEBERÁ evitar transmitir información esencial únicamente mediante color.
6. CUANDO ocurren actualizaciones por Realtime ENTONCES el sistema DEBERÁ usar `aria-live` de forma moderada sin anunciar cada actualización de manera intrusiva.
7. EL Sistema DEBERÁ marcar como `aria-hidden` los elementos decorativos y excluir contenido esencial dentro de elementos `canvas`.

### Requisito 26: Estados de la interfaz

**Historia de usuario:** Como visitante, quiero estados de interfaz claros y amables, para que entienda qué ocurre en cada situación sin mensajes técnicos.

#### Criterios de Aceptación

1. EL Sitio Web DEBERÁ proveer estados de carga premium, esqueleto (skeleton), vacío, sin resultados, error de red, Realtime desconectado, reintentando, oferta expirada, imagen no disponible, datos incompletos, sin destacados, mantenimiento, 404 y error global.
2. CUANDO el Sistema muestra cualquier estado de error ENTONCES el sistema DEBERÁ presentar un mensaje amable y no técnico.

### Requisito 27: Entorno y configuración

**Historia de usuario:** Como desarrollador, quiero una configuración de entorno segura y validada, para que los secretos nunca se filtren y el despliegue falle de forma clara cuando falte configuración.

#### Criterios de Aceptación

1. EL Sistema DEBERÁ proveer un archivo `.env.example` con valores vacíos o seguros para `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID` (valor `5054325626`), `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_EMAIL`, `NEXT_PUBLIC_WHATSAPP_INVITE_URL` y `AMAZON_TRACKING_ID` (valor `programadormx-20`).
2. EL Sistema DEBERÁ mantener la clave de rol de servicio, el Token del Bot y el secreto del webhook como variables exclusivas del servidor, sin el prefijo `NEXT_PUBLIC_`.
3. CUANDO la aplicación inicia ENTONCES el sistema DEBERÁ validar las variables de entorno requeridas.
4. SI una variable de entorno requerida falta en producción ENTONCES el sistema DEBERÁ fallar con un mensaje de error claro.
5. EL Sistema DEBERÁ excluir el contenido de cualquier secreto de los mensajes de error y de la salida impresa.

### Requisito 28: Investigación de componentes React Bits

**Historia de usuario:** Como equipo de producto, quiero documentar la evaluación de componentes React Bits, para que solo se adopten componentes que aporten valor real sin perjudicar el rendimiento ni la experiencia móvil.

#### Criterios de Aceptación

1. EL equipo DEBERÁ investigar los componentes de React Bits con Chrome DevTools y documentar las decisiones en `docs/react-bits-research.md`.
2. EL documento `docs/react-bits-research.md` DEBERÁ incluir una tabla con las columnas: Componente, Uso considerado, Dependencias, Costo de rendimiento, Comportamiento móvil, Decisión y Justificación.
3. EL Sistema DEBERÁ seleccionar únicamente componentes que aporten valor real, adaptándolos al sistema visual del proyecto y usando alternativas gratuitas o implementaciones propias para cualquier componente Pro.
4. EL Sistema DEBERÁ excluir, salvo justificación extraordinaria, los componentes Hyperspeed, Ballpit, Splash Cursor, cursores personalizados agresivos, efectos glitch constantes, parallax excesivo, scroll hijacking, fondos 3D de sección completa y animaciones infinitas en todas las tarjetas.

### Requisito 29: Estrategia de pruebas

**Historia de usuario:** Como desarrollador, quiero pruebas unitarias, de integración y end-to-end con fixtures seguros, para que la lógica crítica esté verificada sin depender del bot real.

#### Criterios de Aceptación

1. EL Sistema DEBERÁ incluir pruebas unitarias para el parser de descuentos, el parser de precios, la normalización, la extracción de ASIN, la extracción de MLM, el cálculo de Fingerprint, la detección de plataforma, la validación de URLs, la lista de dominios permitidos, la comparación del `chat.id`, la idempotencia, el cálculo de ahorro y la generación de slugs.
2. EL Sistema DEBERÁ incluir pruebas de integración para secreto válido e inválido, chat autorizado y no autorizado, actualización duplicada, mensaje nuevo, mensaje editado, mensaje con y sin foto, oferta inválida, URL no permitida, identificador de afiliado incorrecto y actualización de precio.
3. EL Sistema DEBERÁ incluir pruebas end-to-end con Playwright para cargar el inicio, filtrar, buscar, abrir el detalle, compartir, alternar el tema, navegar en móvil, iniciar sesión como administrador, editar una oferta, expirar una oferta, recibir una actualización de Realtime simulada y ver una tarjeta nueva sin recargar.
4. EL Sistema DEBERÁ ejecutar las pruebas sin depender del bot real, usando fixtures y mocks seguros.

### Requisito 30: Entregables de documentación

**Historia de usuario:** Como nuevo integrante del equipo, quiero documentación completa, para que pueda desplegar y mantener el proyecto desde cero.

#### Criterios de Aceptación

1. EL Sistema DEBERÁ proveer los documentos `README.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/react-bits-research.md`, `docs/telegram-integration.md`, `docs/database-schema.md`, `docs/security.md`, `docs/affiliate-compliance.md`, `docs/testing.md`, `docs/deployment.md`, `docs/performance-audit.md` y `.env.example`.
2. EL `README.md` DEBERÁ permitir un despliegue desde cero, cubriendo requisitos, instalación, variables de entorno, Supabase, migraciones, storage, realtime, webhook de Telegram, registro del webhook, desarrollo local, pruebas, build, despliegue, seguridad y solución de problemas (troubleshooting).
