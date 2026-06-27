# Investigación de componentes React Bits

_Tarea 32.1 — Requisitos R28.1, R28.2. Acompaña al plan de selección del diseño
("Componentes React Bits (plan de selección)") y a los requisitos de animación y
rendimiento R18.3–R18.6 y R19.4–R19.5._

## Metodología

La evaluación se hizo inspeccionando en vivo las páginas de componentes de
[reactbits.dev](https://reactbits.dev) con **Chrome DevTools**, observando para
cada candidato:

- **Dependencias reales** que arrastra el componente (panel Sources/Network y el
  bloque de instalación de cada componente): principalmente `motion`
  (framer-motion), `gsap`, o librerías WebGL/GPU (`ogl`, `three`).
- **Huella de rendimiento / GPU**: si el efecto monta un contexto WebGL
  (`<canvas>` + `ogl`/`three`) o si es CSS/transform puro / animación sobre
  `opacity`/`transform`.
- **Comportamiento en móvil**: costo en GPU/CPU de gama baja, dependencia de
  hover/puntero fino, y respeto a `prefers-reduced-motion`.

**Prioridad de decisión** (de mayor a menor, alineada con el diseño):
`seguridad > accesibilidad > rendimiento > honestidad de contenido > diseño >
animación`. Una sola condición adversa (p. ej. costo GPU alto en móvil) basta
para descartar un candidato, aunque su diseño sea atractivo.

**Lista de exclusión rectora (R28.4):** salvo justificación extraordinaria, se
descartan Hyperspeed, Ballpit, Splash Cursor, cursores personalizados agresivos,
glitch constante, parallax excesivo, scroll hijacking, fondos 3D de sección
completa y animaciones infinitas en todas las tarjetas.

### Cómo leer la columna "Justificación"

Cada fila indica si la dependencia/huella fue **inspeccionada directamente** en
DevTools sobre la página del componente, o **evaluada por categoría** (inferida
del patrón común de su familia en React Bits cuando no se abrió su página
individual). Hechos observados directamente:

- **Backgrounds → "Aurora"**: depende de `ogl` (WebGL/GPU).
- **Backgrounds → "Light Rays"**: depende de `ogl` (WebGL/GPU).
- **Text → "Blur Text"**: depende de `motion` (framer-motion; ligero, sin WebGL).
- Por categoría: los demás *Backgrounds* (Side Rays, Soft Aurora, Ballpit,
  Hyperspeed) son WebGL basados en `ogl`/`three`; las animaciones de *Text*
  (Split Text, Scroll Reveal) son `motion`/`gsap`; los *Components* (Spotlight
  Card, Tilted Card, Magnet, Count Up, Animated List) son mayormente `motion` o
  CSS puro.

> **Nota de cumplimiento (R28.3):** no se copia ningún código de React Bits Pro.
> Todos los efectos "adoptados" son **implementaciones propias** escritas desde
> cero y adaptadas al sistema de tokens del proyecto (`hsl(var(--token))`,
> tokens de duración/easing de `lib/ui/motion.ts`), animando **solo** `opacity`
> y `transform` (R18.2) y respetando `prefers-reduced-motion`, `Save-Data` y
> `pointer: coarse`.

## Tabla de evaluación (R28.2)

| Componente | Uso considerado | Dependencias | Costo de rendimiento | Comportamiento móvil | Decisión | Justificación |
|---|---|---|---|---|---|---|
| Soft Aurora | Fondo del hero | `ogl` (WebGL) — _por categoría_ | Alto: contexto WebGL persistente, trabajo de GPU continuo | Costoso en GPU de gama baja; consume batería | **Descartar** | Un fondo WebGL de sección completa contradice la prioridad de rendimiento y la lista de exclusión (fondos 3D de sección completa). Se reemplaza por un **aurora/glow CSS propio** (`radial-gradient` + `blur` con tokens) ya presente en el hero, sin GPU dedicada. |
| Aurora | Fondo del hero | `ogl` (WebGL) — _inspeccionado directamente_ | Alto: WebGL + shaders, repintado continuo | Caída de FPS y calor en móviles modestos | **Descartar** | DevTools confirma dependencia de `ogl`. El costo GPU en móvil de gama baja choca con R19.1/R19.2 y R18.4. Se usa el aurora CSS propio del hero. |
| Light Rays | Fondo del hero | `ogl` (WebGL) — _inspeccionado directamente_ | Alto: WebGL, animación infinita | Igual que Aurora; peor con `Save-Data` | **Descartar** | DevTools confirma `ogl`. Animación infinita + WebGL violan R18.4 y la honestidad de rendimiento. Glow CSS propio cubre la intención visual. |
| Side Rays | Fondo del hero | `ogl`/`three` (WebGL) — _por categoría_ | Alto: WebGL de sección | Costoso en móvil | **Descartar** | Misma familia WebGL que Aurora/Light Rays. Fondo 3D de sección completa está en la lista de exclusión. |
| Spotlight Card | Tarjetas destacadas | `motion` / CSS — _por categoría_ | Bajo: gradiente que sigue al cursor (CSS custom props) | Sin valor en táctil (no hay cursor) | **Adoptar (propia)** | Ya implementado como **`components/offers/premium-spotlight.tsx`**: spotlight + border-glow propios que solo mueven CSS custom props (R18.2), con `requestAnimationFrame` (R18.3) y compuerta `isFeatured && isFirstRow && pointer:fine && !reduced-motion && !Save-Data` (R14.4/R14.5). |
| Reflective Card | Tarjetas destacadas | `motion` / CSS — _por categoría_ | Bajo–medio: brillo/reflejo en hover | Sin cursor en móvil; aporta poco | **Descartar** | Redundante con el spotlight propio; un segundo efecto de tarjeta añadiría ruido sin valor real (R28.3). |
| Border Glow | Tarjetas destacadas | `motion` / CSS — _por categoría_ | Bajo: sombra/anillo animado | Neutral; puede desactivarse fácil | **Adoptar (propia)** | Integrado en `PremiumSpotlight` como `box-shadow inset` con `hsl(var(--primary))`; comparte la misma compuerta y se desactiva en táctil/reduced-motion. |
| Animated List | Feed en vivo | `motion` — _por categoría_ | Bajo: entrada por elemento (opacity/transform) | Correcto si se anima solo lo nuevo | **Adoptar (propia)** | Ya implementado como **`components/offers/live-offer-item.tsx`** sobre `lib/ui/motion` (`fadeInUp` + `transition`): solo las inserciones en vivo animan, las tarjetas existentes no se re-montan (R9.4), y se omite bajo `prefers-reduced-motion` (R18.5). |
| Animated Content | Hero / feed | `motion` — _por categoría_ | Bajo: fade/slide al entrar en viewport | Correcto | **Adoptar (propia)** | Cubierto por `lib/ui/motion` (`fadeIn`/`fadeUp`, utilidades `animate-fade-up`) ya usado en hero y feed; no se añade dependencia nueva. |
| Blur Text | H1 del hero | `motion` (framer-motion) — _inspeccionado directamente_ | Bajo en CPU, **pero** anima `filter: blur` (no permitido por R18.2) y puede retrasar el LCP si arranca invisible | Aceptable salvo el riesgo de LCP | **Adaptar** | Se adapta a **`components/ui/reveal-text.tsx`**: revelado propio del H1 sobre `lib/ui/motion` que anima **solo `transform`** (sin `filter`, R18.2), mantiene el texto **visible y legible en el primer paint** (SSR) para no retrasar el LCP (R18.6) y **no-op** bajo `prefers-reduced-motion`. |
| Split Text | H1 del hero | `motion` / `gsap` — _por categoría_ | Bajo–medio: divide en palabras/letras y escalona | Riesgo de overflow si se usa `inline-block` por palabra | **Adaptar** | La intención (revelado escalonado) se cubre con `RevealText` a nivel de contenedor (`transform` puro), preservando el ajuste de línea responsivo y evitando partir el H1 en `inline-block` que rompería el wrap en móvil (R17.1). |
| Scroll Reveal | Secciones | `gsap` / `motion` — _por categoría_ | Bajo si usa IntersectionObserver | Correcto si pausa fuera de pantalla | **Adaptar** | Se cubre con `motion` (`whileInView`) y las utilidades propias; no se adopta el componente para no introducir `gsap` fuera de donde React Bits lo exija. |
| Count Up | Estadísticas honestas | `motion` — _por categoría_ | Bajo | Correcto | **Descartar** | **Honestidad rectora:** no hay estadísticas inventadas que "contar" (sin cifras infladas, R13.5/transparencia). Animar un número sin dato real y vigente sería deshonesto. |
| Magnet | Botones (escritorio) | `motion` — _por categoría_ | Bajo: `transform` siguiendo al cursor | Sin sentido en táctil; debe desactivarse | **Adaptar** | Implementado como **`components/ui/magnet.tsx`** propio: efecto sutil **solo escritorio** (`pointer: fine`), `transform`-only, traslación máxima pequeña, `requestAnimationFrame`, y **no-op** bajo `pointer: coarse` / `prefers-reduced-motion` / `Save-Data`. La geometría es lógica pura en `lib/ui/magnet.ts` (con pruebas). |
| Tilted Card | Tarjetas | `motion` — _por categoría_ | Medio: rotación 3D en hover | Sin cursor en móvil; mareo/parallax | **Descartar** | La rotación 3D es parallax/efecto de cursor que R18.5 manda eliminar bajo reduced-motion; no aporta claridad. El spotlight propio ya da el realce premium. |
| Card Nav | Navegación | `motion` / CSS — _por categoría_ | Bajo–medio | Aceptable | **Descartar** | El `Header`/`MobileNav` propios ya cubren la navegación con accesibilidad (áreas ≥44px, sin depender de hover, R17.2); añadir Card Nav no aporta valor real. |
| Dock | Navegación | `motion` — _por categoría_ | Medio: escala/seguimiento en hover | Patrón de escritorio; conflictúa con móvil | **Descartar** | Patrón tipo macOS dependiente de hover; redundante con la navegación existente y poco honesto en móvil. |
| Hyperspeed | Fondo | `three` (WebGL) — _por categoría_ | Muy alto: escena 3D animada infinita | Inviable en gama baja | **Descartar** | En la **lista de exclusión** (R28.4): fondo 3D de sección completa + animación infinita. |
| Ballpit | Fondo / hero | `three` (WebGL) — _por categoría_ | Muy alto: física + WebGL | Inviable en móvil | **Descartar** | En la **lista de exclusión** (R28.4). |
| Splash Cursor | Cursor global | `ogl`/`three` (WebGL) — _por categoría_ | Alto: WebGL ligado a `mousemove` | Sin cursor en táctil; ruido | **Descartar** | En la **lista de exclusión** (R28.4): cursor personalizado agresivo. |

## Decisiones clave y su materialización

- **Fondos WebGL del hero (Aurora / Light Rays / Side Rays / Ballpit /
  Hyperspeed) → Descartar.** El costo de GPU en móvil de gama baja contradice
  la prioridad de rendimiento (R19.1, R19.2) y R18.4. El hero usa un **aurora/glow
  CSS propio** (`bg-primary/10 blur-3xl` sobre tokens), sin `<canvas>` ni `ogl`.
- **Blur Text / Split Text → Adaptar** como `components/ui/reveal-text.tsx`: un
  revelado propio del H1 basado en Motion, **LCP-safe** (texto en el HTML SSR y
  visible en el primer paint), `transform`-only (R18.2) y `no-op` bajo
  `prefers-reduced-motion` (R18.5, R18.6).
- **Spotlight Card / Border Glow → Adoptar (propia)**: ya viven en
  `components/offers/premium-spotlight.tsx` con su compuerta de rendimiento
  (R14.4, R14.5).
- **Animated List / Animated Content → Adoptar (propia)**: ya viven en
  `components/offers/live-offer-item.tsx` + `lib/ui/motion.ts`.
- **Count Up → Descartar**: no hay métricas reales que contar; inventarlas
  rompería la honestidad rectora del producto.
- **Magnet → Adaptar** como `components/ui/magnet.tsx`: efecto sutil
  **solo escritorio**, `transform`-only, `rAF`-throttled y completamente
  gateado (`pointer: fine`, `!reduced-motion`, `!Save-Data`).
- **Splash Cursor / Hyperspeed / Ballpit → Descartar**: lista de exclusión.

### Estrategia técnica aplicada (R19.4, R19.5)

- No se añade **ninguna** dependencia WebGL (`ogl`/`three`) al proyecto.
- Los efectos cliente opcionales se montan tras la hidratación y se desactivan
  por completo con `prefers-reduced-motion`, `Save-Data` o `pointer: coarse`.
- Cualquier efecto pesado (si lo hubiera) se cargaría con importación dinámica y
  Suspense localizado; los componentes adoptados aquí son ligeros
  (`opacity`/`transform`) y no requieren WebGL diferido.
- `gsap` se reserva exclusivamente para componentes de React Bits que lo exijan;
  ninguno de los efectos adoptados lo necesita, por lo que no se usa `gsap` en
  esta integración.
