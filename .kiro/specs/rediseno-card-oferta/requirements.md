# Documento de Requisitos: Rediseño de la tarjeta de oferta (`offer-card.tsx`)

## Introducción

Este documento define los requisitos del **rediseño visual** del componente compartido `components/offers/offer-card.tsx` ("la Tarjeta de Oferta") del producto "Ofertas Reales IA". Los requisitos se **derivan del documento de diseño aprobado** (`design.md`) de este mismo _spec_ y de las decisiones ya resueltas por el usuario; no introducen alcance nuevo.

El rediseño es **solo de presentación** (marcado y clases con tokens). No modifica datos, API, esquema de base de datos ni contratos de tipos. La Tarjeta de Oferta es un **Server Component** reutilizado en tres superficies (grilla de `/ofertas`, _hero_ de la página de inicio y sección de destacadas), por lo que cualquier cambio debe conservar su comportamiento en las tres.

Toda decisión se subordina al orden de prioridad del producto —**seguridad > funcionalidad > claridad > accesibilidad > rendimiento > confianza > diseño visual > animación decorativa**— y al **rector de honestidad**: la interfaz nunca insinúa funciones ni datos inexistentes (favoritos, galerías, reseñas, existencias, urgencia, contadores o ahorros agregados).

**Decisiones resueltas que gobiernan estos requisitos** (del diseño aprobado): (1) acción primaria = CTA explícita "Ver en {plataforma}" + Compartir; (2) color del precio = `--primary`; (3) relación de imagen = 4/3; (4) favoritos = fuera de alcance; (5) radio de tarjeta ≈ 18px mediante un token de tarjeta.

**Trazabilidad.** Este _spec_ complementa, sin reemplazarlo, el requisito R14 ("Componente de tarjeta de oferta") del _spec_ principal `ofertas-reales-ia`. Cuando un criterio hereda una obligación de ese _spec_, se indica entre paréntesis su origen (p. ej. _(origen R14.1)_) para mantener la trazabilidad.

## Glosario

- **Tarjeta de Oferta**: El componente `components/offers/offer-card.tsx` rediseñado.
- **Zona Media**: La región superior de la Tarjeta de Oferta que contiene el marco de imagen y las insignias.
- **Cuerpo**: La región inferior de la Tarjeta de Oferta con título, bloque de precio, metadatos, fila de acción y etiqueta de afiliado.
- **Marco de Imagen**: El contenedor redondeado con _padding_ y fondo `bg-surface-elevated` que enmarca la imagen del producto.
- **CTA de Tienda**: La acción primaria de la Tarjeta de Oferta; un enlace que dirige al comercio (Amazon o Mercado Libre) a través del Servicio de Clics.
- **Botón Compartir**: El componente cliente `components/offers/share-button.tsx` (`ShareButton`).
- **Servicio de Clics**: La ruta de API `/api/click/[offerId]` que valida la Oferta y redirige al enlace de afiliado.
- **Insignia de Estado**: El indicador que comunica si la Oferta está "En vivo", es "Nueva" o está "Expirada".
- **Insignia de Plataforma**: El indicador que nombra la tienda destino ("Amazon" / "Mercado Libre").
- **Token de Radio de Tarjeta**: El token de diseño `--radius-card` (≈ 18px) que define el radio de borde de la Tarjeta de Oferta y del Marco de Imagen.
- **Efectos Premium**: Las islas cliente decorativas `BorderGlow` (resplandor de borde que sigue el cursor) y `PremiumSpotlight` (reflejo de la tarjeta destacada).
- **Gate de Efectos Premium**: La condición que habilita los Efectos Premium (puntero preciso, sin `prefers-reduced-motion`, sin `Save-Data`; `PremiumSpotlight` además requiere tarjeta destacada en la primera fila).
- **Precio Oculto**: El estado en el que, por configuración `SHOW_AMAZON_PRICES` desactivada, el precio numérico de Amazon se sustituye por un CTA (origen R22.2).
- **Visitante**: Usuario público que consulta el Sitio Web.
- **`priceDisplay`**: La función pura de `lib/offers/price-visibility` que decide si el precio es visible u oculto.

## Requisitos

### Requisito 1: Anatomía y jerarquía visual de la tarjeta

**Historia de usuario:** Como visitante, quiero una tarjeta de oferta completa y bien jerarquizada, para que pueda comparar precio y descuento de un vistazo y actuar sin depender del hover.

#### Criterios de Aceptación

1. LA Tarjeta de Oferta DEBERÁ incluir imagen, plataforma, estado, título, descuento, precio original tachado mediante un elemento semántico `<del>`, precio actual con números tabulares, ahorro absoluto cuando sea calculable, hora de publicación, hora de última verificación, una acción primaria evidente sin hover y una acción de compartir (origen R14.1).
2. LA Tarjeta de Oferta DEBERÁ representar los estados "nueva" y "expirada" (origen R14.2).
3. LA Tarjeta de Oferta DEBERÁ materializar, mediante tamaño, peso y posición, la jerarquía visual en el orden: precio actual > descuento > producto > imagen > precio original > metadatos (origen R14.3).
4. LA Tarjeta de Oferta DEBERÁ organizarse en dos zonas verticales: la Zona Media (imagen e insignias) sobre el Cuerpo (título, precio, metadatos, acción y etiqueta de afiliado).
5. LA Tarjeta de Oferta DEBERÁ permanecer como Server Component, confinando la interactividad a las islas cliente existentes (`ShareButton`, `RelativeTime`, `PremiumSpotlight`, `BorderGlow`).

### Requisito 2: Zona Media (imagen, marco e insignias)

**Historia de usuario:** Como visitante, quiero ver el producto completo y reconocer de inmediato la tienda y el estado de la oferta, para que pueda evaluar la oferta sin recortes engañosos ni depender del color.

#### Criterios de Aceptación

1. LA Tarjeta de Oferta DEBERÁ mostrar la imagen del producto con `object-fit: contain` dentro del Marco de Imagen, conservando una relación de aspecto 4/3.
2. EL Marco de Imagen DEBERÁ tener _padding_ interno, fondo `bg-surface-elevated` y esquinas redondeadas con el Token de Radio de Tarjeta.
3. CUANDO la imagen de la Oferta no esté lista (`image_status` distinto de `ready` o `image_url` nulo) ENTONCES LA Tarjeta de Oferta DEBERÁ mostrar el componente de respaldo `ImageUnavailable` dentro del Marco de Imagen.
4. LA Tarjeta de Oferta DEBERÁ anclar en la esquina superior izquierda del Marco de Imagen la Insignia de Plataforma ("Amazon" / "Mercado Libre") y la Insignia de Estado.
5. LA Tarjeta de Oferta DEBERÁ comunicar el estado mediante texto e icono de forma conjunta, sin transmitirlo únicamente por color (origen R25.5).
6. CUANDO la Oferta esté expirada (`status === "expired"`) ENTONCES LA Tarjeta de Oferta DEBERÁ mostrar la Insignia de Estado "Expirada" con el icono `TimerOff` en color `warning` y atenuar la opacidad de la tarjeta.
7. CUANDO la Oferta sea nueva (publicada hace menos de 60 minutos y no expirada) ENTONCES LA Tarjeta de Oferta DEBERÁ mostrar la Insignia de Estado "Nueva" con el icono `Sparkles` en color `primary`.
8. MIENTRAS la Oferta esté activa y no sea nueva, LA Tarjeta de Oferta DEBERÁ mostrar la Insignia de Estado "En vivo" con un punto en color `success` acompañado del texto "En vivo".
9. DONDE la Oferta tenga `discount_percent`, LA Tarjeta de Oferta DEBERÁ mostrar en la esquina superior derecha del Marco de Imagen la insignia de descuento "-{porcentaje}%" sobre `bg-primary`, con números tabulares.
10. LA Tarjeta de Oferta DEBERÁ excluir indicadores de carrusel o galería (dots) sobre la imagen, dado que cada Oferta tiene una sola imagen.

### Requisito 3: Cuerpo, título y bloque de precio

**Historia de usuario:** Como visitante, quiero un cuerpo de tarjeta legible con el precio como protagonista, para que entienda el ahorro real y acceda al detalle con claridad.

#### Criterios de Aceptación

1. LA Tarjeta de Oferta DEBERÁ mostrar el título con un máximo de dos líneas (`line-clamp-2`) como enlace a la página de detalle `/ofertas/{slug}`.
2. LA Tarjeta de Oferta DEBERÁ mostrar el precio actual como el elemento más prominente del Cuerpo, en color `--primary`, con peso semibold y números tabulares (origen R14.3).
3. DONDE exista precio original, LA Tarjeta de Oferta DEBERÁ mostrarlo dentro de un elemento semántico `<del>`, con números tabulares y menor jerarquía que el precio actual (origen R14.1).
4. DONDE el ahorro absoluto sea calculable (precio visible y precio original mayor al precio actual), LA Tarjeta de Oferta DEBERÁ mostrar "Ahorras $X" en color `success`.
5. SI la Oferta es de Amazon Y la configuración `SHOW_AMAZON_PRICES` está desactivada ENTONCES LA Tarjeta de Oferta DEBERÁ mostrar el CTA "Consulta el precio actual en Amazon" en lugar del número, sin mostrar el `<del>` ni el ahorro (origen R22.2).
6. LA Tarjeta de Oferta DEBERÁ mostrar los metadatos "Publicada hace X" y "Verificada hace X" mediante la isla cliente `RelativeTime`, con menor prominencia que el bloque de precio (origen R14.1).

### Requisito 4: Acción primaria y cumplimiento de afiliados

**Historia de usuario:** Como visitante, quiero una acción clara que nombre la tienda destino y divulgue que es un enlace de afiliado, para que sepa adónde voy y confíe en el sitio.

#### Criterios de Aceptación

1. LA Tarjeta de Oferta DEBERÁ presentar la acción primaria como una CTA de Tienda con el texto visible "Ver en {plataforma}", descartando un control circular sin texto (decisión resuelta 1).
2. CUANDO un visitante activa la CTA de Tienda ENTONCES LA Tarjeta de Oferta DEBERÁ encaminar el clic a través del Servicio de Clics `/api/click/{offerId}` (origen R11.2).
3. LA CTA de Tienda DEBERÁ excluir cualquier destino provisto por el cliente, dirigiendo únicamente al Servicio de Clics (origen R11.5).
4. LA CTA de Tienda DEBERÁ incluir el atributo `rel="sponsored nofollow noopener"` (origen R11.1).
5. LA CTA de Tienda DEBERÁ exponer un nombre accesible que incluya la plataforma y el título de la Oferta (origen R14.7, R25.3).
6. LA Tarjeta de Oferta DEBERÁ mostrar una etiqueta visible "Enlace de afiliado" próxima a la fila de acción (origen R21.2).
7. LA Tarjeta de Oferta DEBERÁ incluir el Botón Compartir junto a la CTA de Tienda (origen R14.1).

### Requisito 5: Objetivos táctiles

**Historia de usuario:** Como visitante en móvil, quiero controles cómodos de pulsar, para que pueda actuar sin errores de toque.

#### Criterios de Aceptación

1. LA CTA de Tienda DEBERÁ tener una altura mínima táctil de 44px (origen R17.2).
2. EL Botón Compartir DEBERÁ tener una altura mínima táctil de 44px, elevándose desde su tamaño actual (`py-2`, ≈ 36px) (origen R17.2).
3. LA Tarjeta de Oferta DEBERÁ mantener separación suficiente entre la CTA de Tienda y el Botón Compartir para evitar pulsaciones accidentales.

### Requisito 6: Radio de tarjeta mediante token

**Historia de usuario:** Como mantenedor del sistema de diseño, quiero un radio de tarjeta conforme a la guía visual y centralizado en un token, para que la tarjeta cumpla el rango exigido sin valores dispersos.

#### Criterios de Aceptación

1. EL Sistema DEBERÁ definir el Token de Radio de Tarjeta `--radius-card` con un valor de aproximadamente 18px, dentro del rango 18–24px (origen R14.6).
2. LA Tarjeta de Oferta DEBERÁ aplicar el Token de Radio de Tarjeta al contenedor `<article>` y al Marco de Imagen.
3. LA Tarjeta de Oferta DEBERÁ conservar `overflow-hidden` en el contenedor `<article>` para recortar el Marco de Imagen y los Efectos Premium.
4. MIENTRAS los Efectos Premium se posicionen con `inset-0` y `rounded-[inherit]` sobre el contenedor, DEBERÁN heredar el Token de Radio de Tarjeta sin requerir cambios propios.
5. EL Sistema DEBERÁ definir el radio mediante el token, evitando valores de radio hexadecimales o numéricos dispersos en el componente (origen R12.5).

### Requisito 7: Movimiento y coexistencia con efectos premium

**Historia de usuario:** Como visitante, quiero animaciones sutiles y respetuosas que no afecten el rendimiento ni la accesibilidad, para que la tarjeta se sienta premium sin distraer.

#### Criterios de Aceptación

1. LA Tarjeta de Oferta DEBERÁ animar únicamente las propiedades `opacity`, `transform` y `mask`, evitando animar `width`, `height`, `top` o `left` (origen R18.2).
2. LA Tarjeta de Oferta DEBERÁ usar los tokens de duración del sistema y la curva de easing `cubic-bezier(0.22, 1, 0.36, 1)` para sus transiciones (origen R18.1).
3. DONDE el dispositivo tenga puntero con capacidad de hover, LA Tarjeta de Oferta DEBERÁ aplicar al hover una elevación de 2px a 4px y una escala máxima de 1.01 (origen R14.6).
4. SI el visitante tiene activado `prefers-reduced-motion: reduce` ENTONCES LA Tarjeta de Oferta DEBERÁ desactivar la elevación y escala de hover y los Efectos Premium, conservando los estados finales y toda la funcionalidad (origen R18.5).
5. DONDE la tarjeta sea destacada, esté en la primera fila y el puntero sea preciso, EL `PremiumSpotlight` DEBERÁ activarse conforme al Gate de Efectos Premium vigente (origen R14.4).
6. SI el dispositivo usa `pointer: coarse`, `prefers-reduced-motion: reduce` o `Save-Data` ENTONCES los Efectos Premium DEBERÁN permanecer desactivados (origen R14.5).
7. EL rediseño DEBERÁ conservar sin modificación el Gate de Efectos Premium y la lógica de `BorderGlow` y `PremiumSpotlight`, limitándose a su coexistencia visual.
8. LA Tarjeta de Oferta DEBERÁ marcar los Efectos Premium como decorativos, con `aria-hidden` y `pointer-events-none` (origen R25.7).

### Requisito 8: Accesibilidad

**Historia de usuario:** Como visitante que usa tecnología de asistencia, quiero una tarjeta accesible, para que pueda comprender y operar su contenido con teclado y lector de pantalla.

#### Criterios de Aceptación

1. LA Tarjeta de Oferta DEBERÁ cumplir contraste AA en los temas claro y oscuro para el texto y los indicadores esenciales (origen R25.3).
2. LA Tarjeta de Oferta DEBERÁ proveer foco visible en el enlace del título, la CTA de Tienda y el Botón Compartir (origen R25.1).
3. LA Tarjeta de Oferta DEBERÁ evitar transmitir información esencial únicamente mediante color, reforzando el estado con texto e icono, el descuento con texto y el precio con tamaño y peso además del color (origen R25.5).
4. LA Tarjeta de Oferta DEBERÁ usar un texto alternativo significativo para la imagen, empleando `image_alt` o, en su ausencia, el título de la Oferta (origen R14.7).
5. LA Tarjeta de Oferta DEBERÁ marcar como `aria-hidden` los iconos y elementos decorativos (origen R25.7).
6. LA Tarjeta de Oferta DEBERÁ usar estructura semántica: un `<article>` etiquetado por el id del título, el precio original en `<del>`, los metadatos en un `<dl>` y los tiempos mediante el elemento `<time>` provisto por `RelativeTime`.

### Requisito 9: Alcance del rediseño

**Historia de usuario:** Como mantenedor, quiero que el rediseño se limite a la presentación de la tarjeta, para que no introduzca riesgos en datos, API ni dependencias.

#### Criterios de Aceptación

1. EL rediseño DEBERÁ limitar sus cambios a la presentación de `components/offers/offer-card.tsx`, al ajuste de clases de `components/offers/share-button.tsx` y a la definición del Token de Radio de Tarjeta `--radius-card`.
2. EL rediseño DEBERÁ excluir cambios en datos, API, esquema de base de datos y contratos de tipos, incluidos `PublicOffer`, `/api/offers`, `/api/click/[offerId]` y `lib/offers/price-visibility`.
3. EL rediseño DEBERÁ excluir funcionalidad de favoritos o lista de deseos (decisión resuelta 4).
4. EL rediseño DEBERÁ excluir carruseles, galerías e indicadores de múltiples imágenes.
5. EL rediseño DEBERÁ excluir nuevas dependencias, nuevas animaciones JavaScript y efectos WebGL.
6. EL rediseño DEBERÁ conservar sin cambios la página de detalle `/ofertas/[slug]`, la imagen Open Graph (`opengraph-image`) y los filtros y el ordenamiento.
7. EL rediseño DEBERÁ conservar sin modificación la lógica de "nueva" (`NEW_WINDOW_MS`) y la lógica de expiración.

### Requisito 10: Honestidad con el visitante

**Historia de usuario:** Como visitante, quiero que la tarjeta no insinúe funciones ni datos que no existen, para que pueda confiar en lo que veo.

#### Criterios de Aceptación

1. LA Tarjeta de Oferta DEBERÁ excluir cualquier elemento que sugiera funciones o datos inexistentes, incluidos favoritos, galerías o múltiples imágenes, reseñas, existencias, contadores de urgencia, cantidades vendidas y ahorros agregados.
2. LA Tarjeta de Oferta DEBERÁ derivar todo lo que muestra de los campos reales de la Oferta, sin inventar valores.
3. CUANDO un dato obligatorio no esté presente en la Oferta ENTONCES LA Tarjeta de Oferta DEBERÁ omitir ese elemento en lugar de mostrar un valor ficticio.

### Requisito 11: No regresión funcional

**Historia de usuario:** Como responsable del producto, quiero que el rediseño conserve toda la información y el comportamiento críticos actuales, para que no se pierdan capacidades ni cumplimiento al cambiar la estética.

#### Criterios de Aceptación

1. EL rediseño DEBERÁ conservar toda la información obligatoria de la Tarjeta de Oferta enumerada en el Requisito 1 (origen R14.1).
2. EL rediseño DEBERÁ conservar el enrutado del clic a través del Servicio de Clics `/api/click/{offerId}` con el atributo `rel="sponsored nofollow noopener"` (origen R11.1, R11.2).
3. EL rediseño DEBERÁ conservar la etiqueta visible "Enlace de afiliado" (origen R21.2).
4. EL rediseño DEBERÁ conservar el comportamiento del indicador `showAmazonPrices` y la lógica pura `priceDisplay` sin modificarla (origen R22.2).
5. EL rediseño DEBERÁ conservar la condición de Precio Oculto de modo que sea estructuralmente imposible renderizar un precio marcado como oculto (origen R22.2).
6. EL rediseño DEBERÁ conservar la accesibilidad existente: nombre accesible de la CTA de Tienda, texto alternativo de la imagen y nombre accesible del Botón Compartir (origen R14.7).
