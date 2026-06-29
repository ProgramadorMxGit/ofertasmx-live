# Plan de Implementación: Rediseño de la tarjeta de oferta (`offer-card.tsx`)

## Visión general

Este plan convierte el diseño aprobado en pasos de implementación **incrementales** y verificables, ejecutables por un agente de código. El rediseño es **solo de presentación** (marcado, clases Tailwind y un token de radio); no toca datos, API, esquema ni contratos de tipos (Req 9).

- **Lenguaje:** TypeScript / React (el componente es `.tsx`; el diseño no usa pseudocódigo). No se requiere elegir lenguaje.
- **Archivos a tocar (alcance cerrado, Req 9.1):** `app/globals.css`, `components/offers/offer-card.tsx`, `components/offers/share-button.tsx`.
- **Sin cambios** en `lib/offers/price-visibility` (`priceDisplay`), `PublicOffer`, `/api/offers`, `/api/click/[offerId]`, islas cliente (`ShareButton`, `RelativeTime`, `PremiumSpotlight`, `BorderGlow`), página de detalle, `opengraph-image` ni filtros/orden (Req 9.2, 9.6, 11.4).
- **Sin pruebas basadas en propiedades (PBT):** el diseño no incluye sección de *Correctness Properties* y el cambio es de renderizado de UI; la cobertura de pruebas se limita a una prueba de render/no-regresión opcional con Vitest + Testing Library.
- Cada tarea construye sobre la anterior: token → contenedor → zona media → cuerpo → acción → táctiles → accesibilidad → verificación. No queda código huérfano.

## Tareas

- [x] 1. Definir el Token de Radio de Tarjeta `--radius-card`
  - En `app/globals.css`, dentro del bloque "Radius scale" existente (junto a `--radius-sm`, `--radius-control`, `--radius`, `--radius-lg`), añadir `--radius-card: 1.125rem;` (≈ 18px, dentro del rango 18–24px exigido).
  - Documentar con un comentario breve que es el radio de la tarjeta de oferta y su marco de imagen.
  - No introducir valores de radio hexadecimales ni numéricos dispersos: el token es la única fuente de verdad.
  - _Requisitos: 6.1, 6.5_

- [x] 2. Actualizar el contenedor `<article>` y preservar el contrato de movimiento
  - En `components/offers/offer-card.tsx`, cambiar el radio del `<article>` de `rounded-[var(--radius)]` a `rounded-[var(--radius-card)]`.
  - Conservar `overflow-hidden` y `flex flex-col`; el `<article>` sigue siendo Server Component (sin `"use client"`).
  - Conservar sin cambios la transición/hover existentes: animar solo `transform` (elevación 2–4px + escala ≤ 1.01) con tokens de duración y `ease-emphasized`, y `motion-reduce:transition-none`.
  - Confirmar que `BorderGlow` y `PremiumSpotlight` permanecen como hermanos `inset-0` con `rounded-[inherit]`, decorativos (`aria-hidden`, `pointer-events-none`) y con su gate sin modificar; al heredar el radio del `<article>`, adoptan `--radius-card` sin cambios propios.
  - _Requisitos: 1.5, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.7, 7.8_

- [x] 3. Reconstruir la Zona Media (marco de imagen + insignias)
  - Envolver la imagen en un Marco de Imagen interior: `bg-surface-elevated`, `rounded-[var(--radius-card)]` y _padding_ interno (`p-3`/`p-4`), conservando `aspect-[4/3]`.
  - Renderizar la imagen con `next/image` (`fill`, `object-contain`) y `alt` significativo (`offer.image_alt ?? offer.title`); conservar el _fallback_ `ImageUnavailable` cuando `image_status !== "ready"` o `image_url === null`.
  - Anclar al marco, en la esquina superior izquierda, la Insignia de Plataforma (`Amazon` / `Mercado Libre`) y la Insignia de Estado, comunicando el estado con **texto + icono** (nunca solo color): "En vivo" (punto `success` + texto), "Nueva" (`Sparkles` `text-primary`, < 60 min vía `NEW_WINDOW_MS` sin cambios) y "Expirada" (`TimerOff` `text-warning`); mantener `opacity-80` en la tarjeta cuando esté expirada.
  - Anclar al marco, en la esquina superior derecha, la insignia de descuento `-{discount_percent}%` sobre `bg-primary`, con números tabulares (solo cuando `discount_percent` exista).
  - No añadir _dots_ de carrusel ni indicadores de galería (una sola imagen por oferta).
  - _Requisitos: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 6.2_

- [x] 4. Reescalar el Cuerpo y el bloque de precio
  - Título: `line-clamp-2` como enlace a `/ofertas/{slug}` con `hover:text-primary` y foco visible.
  - Precio actual como elemento más prominente: tamaño grande (`text-h5`+), `font-semibold`, números tabulares y color `--primary` (`text-primary`).
  - Precio original dentro de un `<del>` semántico, tabular y con menor jerarquía; "Ahorras $X" en `text-success` solo cuando el ahorro sea calculable (precio visible y original > actual).
  - Conservar el bloque de Precio Oculto: cuando `priceDisplay(offer, showAmazonPrices)` devuelva `kind: "hidden"`, mostrar el CTA "Consulta el precio actual en Amazon" en lugar del número, **sin** `<del>` ni ahorro. No modificar `lib/offers/price-visibility`; mantener la rama que hace estructuralmente imposible renderizar un precio oculto.
  - Metadatos "Publicada hace X" y "Verificada hace X" mediante la isla `RelativeTime`, con menor prominencia que el precio.
  - _Requisitos: 1.1, 1.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 11.4, 11.5_

- [x] 5. Reestilizar la fila de acción y el _disclosure_ de afiliado
  - Acción primaria (Opción A): CTA con texto visible "Ver en {plataforma}" reestilizada premium (con `ExternalLink` decorativo `aria-hidden`); descartar cualquier control circular mudo.
  - Conservar el enrutado del clic por `/api/click/{offer.id}` (sin destino provisto por el cliente) y el atributo `rel="sponsored nofollow noopener"`.
  - Conservar el nombre accesible que incluye plataforma + título (`aria-label="Ver oferta en {plataforma}: {título}"`).
  - Conservar el `ShareButton` junto a la CTA y la etiqueta visible "Enlace de afiliado" próxima a la fila de acción.
  - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 11.2, 11.3_

- [x] 6. Elevar los objetivos táctiles a ≥ 44px
  - Añadir `min-h-[44px]` a la CTA de Tienda en `offer-card.tsx`.
  - En `components/offers/share-button.tsx`, elevar el botón desde su tamaño actual (`px-3 py-2`, ≈ 36px) a ≥ 44px (p. ej. `min-h-[44px]`), conservando su nombre accesible, el icono decorativo y la lógica cliente intacta.
  - Mantener separación suficiente (`gap`) entre la CTA y el Botón Compartir para evitar pulsaciones accidentales.
  - _Requisitos: 5.1, 5.2, 5.3_

- [x] 7. Endurecer accesibilidad y semántica
  - Verificar foco visible (`focus-visible:ring-2 focus-visible:ring-focus-ring`) en el enlace del título, la CTA de Tienda y el Botón Compartir.
  - Reforzar que ninguna información esencial dependa solo del color: estado con texto + icono, descuento como texto "-{%}", precio con tamaño/peso además del color.
  - Confirmar `alt` significativo (`image_alt ?? title`) e iconos/elementos decorativos con `aria-hidden="true"`.
  - Confirmar la estructura semántica: `<article aria-labelledby>` referenciando el `id` del título, precio original en `<del>`, metadatos en `<dl>` y tiempos en `<time>` (vía `RelativeTime`).
  - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 8. Checkpoint — coherencia tras la implementación
  - Asegúrate de que la tarjeta conserva toda la información obligatoria y los estados; si surgen dudas de diseño, pregunta al usuario antes de continuar.

- [x] 9. Verificación de calidad y no-regresión
  - [x] 9.1 Ejecutar verificación estática y de compilación
    - Ejecutar `npm run typecheck`, `npm run lint` y `npm run build` (ejecución única, sin modo _watch_); corregir cualquier error o advertencia introducido.
    - Confirmar por inspección del _diff_ que solo cambiaron `app/globals.css`, `components/offers/offer-card.tsx` y `components/offers/share-button.tsx`; que no se añadieron dependencias, animaciones JS ni tokens de color nuevos; y que `priceDisplay`/`lib/offers/price-visibility`, `PublicOffer`, `/api/offers` y `/api/click/[offerId]` quedan intactos.
    - Confirmar que se conserva la lógica de "nueva" (`NEW_WINDOW_MS`) y de expiración, y que el precio sigue usando `--primary` (sin acento nuevo, contraste AA ya calibrado en claro/oscuro).
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 8.1, 10.1, 10.2, 10.3, 11.1, 11.4, 11.6_
  - [ ]* 9.2 Escribir prueba de render/no-regresión (Vitest + Testing Library)
    - Renderizar `OfferCard` con datos simulados y aseverar: información obligatoria presente; CTA con `rel="sponsored nofollow noopener"` y `href` hacia `/api/click/{id}`; nombre accesible con plataforma + título; etiqueta "Enlace de afiliado" presente.
    - Aseverar la matriz de estados: "nueva", "en vivo", "expirada", "sin imagen" (usa `ImageUnavailable`) y "precio oculto" de Amazon (muestra el CTA y **no** renderiza `<del>` ni "Ahorras").
    - Ejecutar con `npm test` (vitest run, ejecución única).
    - _Requisitos: 2.5, 3.5, 4.4, 4.5, 4.6, 11.1, 11.2, 11.3, 11.5_

- [x] 10. Checkpoint final
  - Asegúrate de que `npm run typecheck`, `npm run lint`, `npm run build` y las pruebas pasen; si surgen dudas, pregunta al usuario.

## Notas

- Las subtareas marcadas con `*` (9.2) son opcionales y pueden omitirse para un MVP más rápido; no deben implementarse salvo indicación explícita.
- Cada tarea referencia los criterios de aceptación de `requirements.md` para trazabilidad.
- No hay tareas de PBT: el diseño es de presentación de UI y carece de sección de *Correctness Properties*; la verificación se cubre con compilación, _lint_, _typecheck_ e inspección del _diff_, más la prueba de render opcional.
- Ejecuta comandos en modo de ejecución única (sin _watch_); no levantes servidores de desarrollo dentro de las tareas.

---

> **Nota de cierre.** Este flujo `design-first` para `rediseno-card-oferta` queda **completo** con los tres artefactos: `design.md`, `requirements.md` y `tasks.md`. La **ejecución del código queda pendiente de tu orden explícita**: abre `tasks.md` y pulsa "Start task" junto a la tarea que quieras iniciar (recomendado empezar por la Tarea 1). No se ha implementado ningún código todavía.
