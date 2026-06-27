# Auditoría de rendimiento — Ofertas Reales IA

> Documento de la Tarea 39 del spec `ofertas-reales-ia`. Recoge los objetivos de
> rendimiento (R19), la metodología de medición, las optimizaciones de
> rendimiento **ya aplicadas a nivel de código** (verificadas contra el
> repositorio) y la lista de verificación visual.
>
> **Principio rector de honestidad (no negociable).** Este documento **no
> inventa** puntuaciones de Lighthouse ni valores numéricos de LCP, CLS o INP.
> La medición en vivo requiere la aplicación ejecutándose con credenciales
> reales de Supabase y/o un despliegue en Vercel; ese entorno **no** está
> disponible al redactar este documento. Las celdas de métricas concretas se
> marcan como `Pendiente de medición en entorno con credenciales` hasta que el
> responsable las complete con datos reales (ver §5).

---

## 1. Encabezado y alcance

Esta auditoría cubre las cuatro superficies representativas de la plataforma:

| Ruta | Descripción | Tipo de render |
|------|-------------|----------------|
| `/` | Inicio editorial: hero, barra de confianza, ofertas en vivo, destacados, "cómo funciona", transparencia, CTA | SSR (`force-dynamic`) + isla cliente para Realtime |
| `/ofertas` | Listado con filtros, orden, búsqueda y carga progresiva por keyset | SSR de la primera página + isla cliente |
| `/ofertas/[slug]` | Detalle de una oferta + relacionadas + datos estructurados | SSR por slug |
| `/admin` | Panel protegido por Supabase Auth (fuera de la navegación pública) | SSR autenticado |

Cada ruta se evalúa en los siguientes **viewports** (anchura × altura, según
§35 del prompt maestro):

| Viewport | Clase de dispositivo |
|----------|----------------------|
| 1440 × 900 | Escritorio grande |
| 1280 × 800 | Escritorio / laptop |
| 768 × 1024 | Tablet (retrato) |
| 390 × 844 | Móvil moderno |
| 360 × 800 | Móvil Android de gama baja |

El objetivo es doble: confirmar las **Core Web Vitals** y las puntuaciones
**Lighthouse** objetivo (§2) y ejecutar la **auditoría visual** (§6) en cada
combinación ruta × viewport.

---

## 2. Objetivos (R19)

Objetivos definidos en el requisito R19 (criterios R19.1 y R19.2) y reafirmados
en la sección "Rendimiento" del documento de diseño.

### Core Web Vitals — móvil representativo (R19.1)

| Métrica | Objetivo | Significado |
|---------|----------|-------------|
| LCP (Largest Contentful Paint) | **< 2.5 s** | Tiempo hasta pintar el elemento principal |
| CLS (Cumulative Layout Shift) | **< 0.1** | Estabilidad visual (sin saltos de maquetación) |
| INP (Interaction to Next Paint) | **< 200 ms** | Capacidad de respuesta a la interacción |

### Lighthouse móvil — modo navegación (R19.2)

| Categoría | Puntuación objetivo |
|-----------|---------------------|
| Performance | **≥ 90** |
| Accessibility | **≥ 95** |
| Best Practices | **≥ 95** |
| SEO | **≥ 95** |

---

## 3. Metodología

Procedimiento que un mantenedor debe seguir para obtener mediciones reales. La
medición **debe** hacerse con la aplicación sirviendo datos reales: la página de
inicio usa `force-dynamic` y los ayudantes de obtención degradan a lista vacía
sin credenciales, por lo que medir sin Supabase real arrojaría una página vacía
y métricas no representativas.

### 3.1 Preparar el entorno

Elegir **una** de estas dos opciones:

- **Opción A — Despliegue en Vercel (recomendada).** Medir contra el dominio de
  producción/preview con las variables de entorno reales configuradas en Vercel
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL`, etc.). Es el entorno más fiel porque incluye la red,
  la CDN y el runtime serverless reales.
- **Opción B — Build de producción local contra Supabase real.** Ejecutar
  `npm run build` seguido de `npm run start` (nunca `npm run dev`, que no
  representa el rendimiento de producción) con un archivo `.env.local` que
  apunte a un proyecto Supabase real con ofertas activas sembradas.

En ambos casos debe existir un conjunto de ofertas activas (idealmente las
seeds de R24) para que la lista y las imágenes se rendericen como en producción.

### 3.2 Traza de rendimiento (Chrome DevTools)

1. Abrir la ruta objetivo en Chrome en una ventana de incógnito (sin
   extensiones que contaminen la traza).
2. Emular el dispositivo móvil y aplicar estrangulamiento (CPU 4×–6× y red
   "Slow 4G" / "Fast 3G") para aproximar un móvil de gama media.
3. Grabar una traza de **carga** (recargar con la grabación activa) y una de
   **interacción** (abrir filtros, desplazarse, abrir un detalle) para observar
   INP.
4. Revisar LCP, CLS y los "insights" de la traza (latencia de documento,
   desglose de LCP, trabajo de hilo principal).

### 3.3 Lighthouse (móvil, modo navegación)

1. Pestaña **Lighthouse** de DevTools (o `lighthouse` CLI).
2. Dispositivo: **Mobile**; modo: **Navigation**; categorías: Performance,
   Accessibility, Best Practices, SEO.
3. Ejecutar **3 veces** por ruta y conservar la **mediana** (Lighthouse de
   laboratorio tiene varianza entre ejecuciones).
4. Registrar las cuatro puntuaciones y los CWV de laboratorio por ruta y
   viewport.

### 3.4 Registro

Volcar los números obtenidos en las tablas de §2 y §4 (columnas `Métrica
inicial` / `Métrica final`), anotando fecha, commit, dominio/entorno y
condiciones de estrangulamiento. Idealmente complementar con datos de campo
(CrUX / Web Vitals reales) una vez haya tráfico.

---

## 4. Optimizaciones aplicadas a nivel de código

Optimizaciones de rendimiento **ya presentes en el código** (verificadas contra
el repositorio en los archivos citados). Siguiendo el principio de honestidad,
las columnas `Métrica inicial` y `Métrica final` quedan pendientes hasta la
medición en vivo (§5); la columna `Corrección` documenta la optimización real y
`Causa` el problema de rendimiento que previene.

| Métrica inicial | Causa | Corrección | Métrica final |
|-----------------|-------|------------|---------------|
| Pendiente de medición en entorno con credenciales | Renderizar la lista en cliente retrasaría el contenido y el LCP, y dependería de JS | **SSR de la lista inicial** de ofertas activas y destacadas mediante ayudantes `server-only` (`lib/offers/server-fetch.ts`: `fetchActiveOffers`, `fetchFeaturedOffers`); la página `/` (`app/(public)/page.tsx`) es Server Component `async` (R19.3, R9.1) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | JavaScript de cliente innecesario aumenta el bundle y el TBT/INP | **Server Components por defecto**; Client Components solo donde hay interacción real. La única isla cliente del inicio es `LiveOffersSection` (`"use client"`), sembrada desde el SSR para funcionar sin Realtime (R19.6, R9.1) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Paginación por `OFFSET` se degrada en listas largas y puede duplicar/saltar filas | **Paginación por keyset (cursor)** sobre `(published_at desc, id desc)`, `(discount_percent desc, id desc)` y `(current_price asc, id asc)` en el módulo puro `lib/offers/query.ts`, con cursor opaco y `limit + 1` para detectar la página siguiente sin segunda consulta (`executeOffersQuery`) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Escaneos secuenciales en la tabla `offers` elevan la latencia de consulta | **Índices parciales `where status = 'active'`**: `offers_active_recent_idx (published_at desc, id desc)` y `offers_active_discount_idx (discount_percent desc)` (`supabase/migrations/0003_indexes_triggers.sql`), alineados con el orden del keyset (R19.6) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Enviar columnas internas/ingesta infla el payload y filtra datos | **Proyección pública de columnas** (`PUBLIC_OFFER_COLUMNS` en `lib/offers/query.ts`): solo se seleccionan columnas seguras, omitiendo `fingerprint`, `raw_text`, los `telegram_*` y `affiliate_tag` | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Imágenes sin optimizar perjudican el LCP y consumen ancho de banda | **`next/image`** en tarjetas, detalle, header y footer (`components/offers/offer-card.tsx`, `offer-detail.tsx`, `components/layout/*`), con imágenes responsivas; carga diferida por defecto y **`priority`** solo en la primera tarjeta demo del hero para precargar únicamente el recurso del LCP (R19.3, R19.4) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Fuentes con peticiones en runtime causan FOUT/CLS | **`next/font`** (Geist Sans + Instrument Serif) con `subsets: ["latin"]`, auto-hospedadas en build y `display: "swap"`, expuestas como variables CSS (`app/layout.tsx`) (R19.3, R12.6) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Una animación del H1 que bloquee el primer pintado dispara el LCP | **H1 protegido para el LCP**: el texto del H1 se renderiza en servidor y es legible en el primer pintado; `RevealText` es una mejora post-hidratación solo de `transform` que se anula con `prefers-reduced-motion` y **nunca** condiciona el H1 (`components/layout/hero.tsx`) (R18.6) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Animar `width/height/top/left` provoca reflujo y jank | **Animar solo `opacity` y `transform`**; las animaciones se anulan con `motion-reduce:*` (p. ej. `animate-fade-up`, indicadores `animate-ping motion-reduce:animate-none`) (R18.2, R18.5) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Efectos premium/seguimiento de cursor en móvil malgastan CPU/GPU y batería | **Compuerta de efectos premium**: se habilitan solo si la tarjeta es destacada **y** está en la primera fila **y** el puntero es preciso (`pointer: fine`) **y** no hay `prefers-reduced-motion` **y** no hay `Save-Data` (gate puro en `lib/ui/premium-effects.ts`, envoltorios cliente `premium-spotlight.tsx` y `magnet.tsx`; verificado por la Propiedad 19) (R14.4, R14.5, R18.5) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | Un fondo WebGL a pantalla completa es costoso en CPU/GPU, sobre todo en móvil | **Sin WebGL en el bundle**: la build actual **no** monta componentes WebGL ni de React Bits pesados; los efectos son CSS/`transform` y están gated por dispositivo. El patrón de **importación dinámica con Suspense localizado** (`next/dynamic`, `ssr: false`) queda reservado como estrategia para cualquier componente pesado/WebGL que se incorpore en el futuro (R19.4, R19.5, R17.3) | Pendiente de medición en entorno con credenciales |
| Pendiente de medición en entorno con credenciales | El parpadeo de tema (FOUC) provoca salto visual y CLS | **Bootstrap de tema antes del pintado**: script inline síncrono en `<body>` que fija `data-theme` según preferencia almacenada → SO → oscuro, evitando el flash (`app/layout.tsx`) | Pendiente de medición en entorno con credenciales |

> **Notas de honestidad sobre el estado del código (para evitar afirmaciones
> falsas):**
>
> - **Importaciones dinámicas / WebGL.** A la fecha de este documento **no** hay
>   llamadas a `next/dynamic` ni componentes WebGL/React Bits en el código
>   fuente. La postura actual —no enviar WebGL en absoluto y usar efectos
>   CSS/`transform` gated— es la opción de rendimiento más conservadora; la
>   estrategia de carga diferida descrita en el diseño (R19.4, R19.5) aplicará
>   cuando se introduzca un componente pesado.
> - **Caché con etiquetas + `revalidateTag`.** El diseño contempla
>   `unstable_cache` / `revalidateTag('offers')` coexistiendo con Realtime; la
>   implementación actual prioriza frescura con **`force-dynamic`** (SSR en cada
>   visita) y Realtime del lado cliente. La caché con etiquetas aún **no** está
>   cableada y es una mejora futura, no una optimización ya aplicada.

---

## 5. Estado de la medición en vivo

> **PENDIENTE — La medición en vivo de Lighthouse y Core Web Vitals no se ha
> ejecutado.** No existen, por tanto, puntuaciones ni valores de LCP/CLS/INP
> reales que reportar. Cualquier número en este documento marcado como
> `Pendiente de medición en entorno con credenciales` debe ser sustituido por el
> responsable tras medir.

**Por qué está pendiente:**

1. La medición requiere la aplicación ejecutándose con
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` **reales** (o un
   despliegue en Vercel con esas variables). Sin credenciales, los ayudantes de
   obtención degradan a lista vacía por diseño y la página no es representativa.
2. El entorno de automatización donde se generó este documento **no** puede
   iniciar servidores de larga duración (`npm run dev` / `npm run start`) ni
   levantar Chrome para una traza/Lighthouse reales.

**Qué debe hacer el responsable para obtener los números reales:**

1. Desplegar en Vercel **o** ejecutar un build de producción local contra un
   Supabase real con ofertas activas sembradas (§3.1).
2. Ejecutar la traza de DevTools y Lighthouse móvil (modo navegación) por cada
   ruta de §1 y viewport de §1, tomando la mediana de 3 ejecuciones (§3.2–§3.3).
3. Rellenar las columnas `Métrica inicial` / `Métrica final` de §4 y las tablas
   de §2 con los valores medidos, anotando fecha, commit y entorno.
4. Si alguna métrica no alcanza su objetivo (§2), abrir una incidencia con la
   traza adjunta y enlazar la corrección correspondiente en la tabla de §4.

---

## 6. Lista de verificación de auditoría visual

Ejecutar esta lista por cada **ruta × viewport** (§1) con la aplicación en vivo.
Marcar cada ítem como correcto, o registrar la incidencia con captura y los
pasos para reproducirla.

- [ ] **Sin desbordamiento horizontal.** Ninguna ruta produce scroll lateral en
  360 × 800, 390 × 844 ni 768 × 1024.
- [ ] **Sin texto cortado ni truncado indebidamente.** Títulos, precios y
  descripciones se leen completos; la escala tipográfica `clamp()` se mantiene
  legible en 360 px.
- [ ] **Imágenes sin deformación.** Las imágenes de oferta conservan su relación
  de aspecto (sin estiramiento) y muestran el respaldo cuando faltan.
- [ ] **Menús y cajón (drawer) móvil.** El menú móvil abre/cierra, las áreas
  táctiles son ≥ 44 px y no dependen de `hover`; el cajón de filtros funciona en
  móvil.
- [ ] **Foco visible y orden de tabulación.** Todos los elementos interactivos
  muestran anillo de foco; el enlace "Saltar al contenido" funciona y el orden
  de foco es lógico.
- [ ] **Header sticky.** Transición de transparente a superficie con desenfoque
  al desplazar, sin saltos de maquetación ni solapamiento del contenido.
- [ ] **Modales / overlays.** Búsqueda (`/` y Ctrl/Cmd+K) y cualquier overlay
  atrapan el foco, cierran con `Esc` y restauran el foco al disparador.
- [ ] **Filtros y orden.** Plataforma, categoría, descuento, rango de precio y
  orden se reflejan en la URL y reconstruyen el estado al recargar.
- [ ] **Skeletons.** Los estados de carga aparecen sin provocar CLS al
  reemplazarse por el contenido real.
- [ ] **Estados vacíos.** "Sin ofertas", "sin destacados" y "sin resultados" se
  muestran de forma honesta, sin inventar datos.
- [ ] **Tema claro / oscuro.** Ambos temas son plenamente funcionales (no una
  inversión), con contraste suficiente y sin parpadeo (FOUC) al cargar.
- [ ] **Realtime no intrusivo.** Una oferta nueva entra con animación breve y
  aviso discreto, sin robar el foco ni provocar saltos de scroll.
