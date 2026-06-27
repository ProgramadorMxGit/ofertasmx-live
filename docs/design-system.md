# Sistema de diseño — Ofertas Reales IA

Este documento describe el sistema visual de la plataforma: tokens de color,
tipografía, sistema de animación y los componentes de React Bits efectivamente
adoptados. Es la referencia para construir UI nueva sin dispersar valores
mágicos por el código.

Orden de prioridad que rige todo conflicto de diseño (del documento de diseño):

```
seguridad > funcionalidad > claridad > accesibilidad > rendimiento > confianza > diseño visual > animación decorativa
```

Todo lo visual fluye de **tokens semánticos**; no se usan colores hexadecimales
sueltos en los componentes (R12.5). Las utilidades de Tailwind resuelven a
`hsl(var(--token))`, y los valores calibrados viven en `app/globals.css`.

## Temas: dark-first con claro calibrado aparte

El tema se controla con el atributo `data-theme` sobre `<html>` (`"dark"` o
`"light"`). El diseño es **dark-first** (R12.3): el valor por defecto del
servidor es `dark`, y el tema claro es una **paleta calibrada por separado**,
no una inversión mecánica del oscuro (R12.3, R12.4).

- **Sin destello (FOUC-safe):** un script inline en `<body>` (`app/layout.tsx`)
  fija `data-theme` antes de pintar contenido visible. Prioridad de resolución:
  elección guardada en `localStorage` → preferencia del sistema operativo →
  `dark` (el valor por defecto). El `<html>` lleva `suppressHydrationWarning`
  porque el script puede ajustar el atributo antes de la hidratación.
- **ThemeToggle sin estado de cliente:** los íconos sol/luna se intercambian por
  CSS según `data-theme` (`[data-theme="dark"] [data-theme-icon="sun"]` se
  oculta, y viceversa), eliminando cualquier desajuste de hidratación. Los
  íconos son decorativos.

### Tokens de color (R12.4)

Cada token se define en HSL sin la función `hsl()` para poder componer opacidad
con las utilidades de Tailwind (p. ej. `bg-primary/10`). Los valores están
calibrados para que los pares de texto principales (`foreground` y
`muted-foreground` sobre `background`/`surface`) y los acentos de estado usados
como texto superen WCAG AA (≥ 4.5:1) en ambos temas.

| Token | Tema oscuro (por defecto) | Tema claro (calibrado) |
|-------|---------------------------|------------------------|
| `--background` | `222 24% 7%` | `210 40% 99%` |
| `--foreground` | `210 20% 96%` | `222 32% 14%` |
| `--surface` | `222 20% 10%` | `0 0% 100%` |
| `--surface-elevated` | `222 18% 13%` | `210 40% 97%` |
| `--muted` | `222 12% 22%` | `214 20% 92%` |
| `--muted-foreground` | `215 16% 64%` | `215 16% 38%` |
| `--border` | `222 14% 20%` | `214 20% 86%` |
| `--primary` | `199 89% 52%` | `199 89% 30%` |
| `--primary-foreground` | `222 47% 7%` | `0 0% 100%` |
| `--success` | `152 60% 42%` | `152 55% 32%` |
| `--warning` | `38 92% 55%` | `32 90% 34%` |
| `--danger` | `0 72% 60%` | `0 66% 46%` |
| `--focus-ring` | `199 89% 60%` | `199 89% 40%` |

**Nota sobre `--primary` en claro:** su luminosidad se afinó a **30%** (en vez de
un valor más alto) para que `text-primary` como texto pequeño supere WCAG AA
(≥ 4.5:1) incluso sobre el tenue resplandor primario del hero de inicio (R25.3).
Usado como **fondo** de botón solo gana contraste contra el blanco, por lo que
el ajuste no perjudica los CTAs.

Cada tema también fija `color-scheme` (`dark`/`light`) para que los controles
nativos del navegador (scrollbars, formularios) acompañen el tema.

### Mapeo en Tailwind

`tailwind.config.ts` expone los tokens como colores (`background`, `foreground`,
`surface` + `surface.elevated`, `muted` + `muted.foreground`, `border`,
`primary` + `primary.foreground`, `success`, `warning`, `danger`,
`focus-ring`). `darkMode` está configurado como `["class", '[data-theme="dark"]']`.

El foco visible para teclado se aplica globalmente con
`:focus-visible { outline: 2px solid hsl(var(--focus-ring)); outline-offset: 2px }`
(R25.1).

## Tipografía (R12.6, R12.7)

Las fuentes se cargan con `next/font` (auto-hospedadas en build, sin peticiones
en runtime) y se exponen como variables CSS:

- **Geist Sans** — tipografía de interfaz, `--font-sans` (`font-sans` en Tailwind).
- **Instrument Serif** — acento editorial limitado (H1 y citas destacadas),
  `--font-serif` (`font-serif`), peso 400.

**Números tabulares (R12.6):** precios, descuentos y estadísticas usan la
utilidad `.font-tabular`, que aplica `font-variant-numeric: tabular-nums
lining-nums` (`"tnum" 1, "lnum" 1`) para que las cifras alineen en columnas y no
"bailen" al actualizarse en vivo.

### Escala tipográfica fluida (R12.7)

Escala con `clamp()` que se mantiene legible en Android de gama baja (cuerpo
≥ 16px, metadatos ~13px). Los pasos se mapean a tokens de `fontSize` en Tailwind:

| Variable CSS | `clamp()` | Token Tailwind | Uso |
|--------------|-----------|----------------|-----|
| `--step--1` | `clamp(0.8rem, 0.76rem + 0.18vw, 0.875rem)` | `text-meta` | metadatos / captions |
| `--step-0` | `clamp(1rem, 0.95rem + 0.3vw, 1.125rem)` | `text-body` | cuerpo |
| `--step-1` | `clamp(1.2rem, 1.11rem + 0.46vw, 1.4rem)` | `text-h6` | — |
| `--step-2` | `clamp(1.44rem, 1.3rem + 0.7vw, 1.75rem)` | `text-h5` | — |
| `--step-3` | `clamp(1.728rem, 1.52rem + 1.04vw, 2.2rem)` | `text-h4` | — |
| `--step-4` | `clamp(2.074rem, 1.78rem + 1.47vw, 2.75rem)` | `text-h3` | — |
| `--step-5` | `clamp(2.488rem, 2.06rem + 2.14vw, 3.45rem)` | `text-h2` | — |
| `--step-6` | `clamp(2.986rem, 2.39rem + 2.98vw, 4.3rem)` | `text-h1` | H1 del hero |

El H1 lleva `line-height: 1.05` y `letter-spacing: -0.02em`.

## Sistema de animación (R18)

Los **valores** de movimiento son una única fuente de verdad, compartida entre
CSS (custom properties en `app/globals.css`) y JS/Motion (`lib/ui/motion.ts`).
El módulo de motion es agnóstico del framework y SSR-safe, por lo que puede
importarse desde Server o Client Components.

### Tokens de duración y easing (R18.1)

| Token | Duración | Rango de diseño |
|-------|----------|-----------------|
| `instant` | 120ms | 100–140ms |
| `fast` | 190ms | 160–220ms |
| `normal` | 280ms | 240–320ms |
| `editorial` | 520ms | 450–650ms |

- **Easing principal:** `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-emphasized` /
  `ease-emphasized` en Tailwind; `EASE_EMPHASIZED_POINTS` para `framer-motion`).
- `motion.ts` también expone los tokens en segundos (`DURATION_S`) y un helper
  `transition(token)` para configs de Motion.

### Reglas de movimiento

- **Solo `opacity` y `transform`** (R18.2). Nunca se animan propiedades de layout
  (`width`/`height`/`top`/`left`). Las keyframes de Tailwind lo respetan:
  `shimmer` (transform), `fade-in` (opacity) y `fade-up` (opacity + `translateY`).
- **Variantes de Motion:** `fadeIn` y `fadeInUp` (opacity/transform) para
  entradas de tarjetas, ítems de lista y resaltados.
- **`requestAnimationFrame`** para limitar trabajo ligado a `mousemove`; pausar
  animaciones fuera de pantalla o en pestaña oculta (R18.3, R18.4).
- **`prefers-reduced-motion: reduce`** (R18.5, R18.6): una regla global colapsa
  transiciones y animaciones a ~0ms y desactiva el scroll suave, **conservando**
  los estados finales de opacity/transform (se aplican de inmediato) y **toda**
  la funcionalidad. El helper `prefersReducedMotion()` es SSR-safe (devuelve
  `false` sin DOM) para que el contenido nunca dependa de que esa señal resuelva.
- **Protección del LCP (R18.6):** el contenido principal (H1) se pinta sin
  esperar animaciones; las animaciones decorativas se montan después de la
  hidratación y los efectos pesados se difieren.

### Librerías

- **Motion** (`framer-motion`) para la animación general de UI.
- **GSAP** se reserva **exclusivamente** para componentes de React Bits que lo
  exijan; ninguno de los efectos adoptados lo necesita, así que en la práctica no
  se usa en esta integración.

## Componentes de React Bits adoptados

La evaluación completa (metodología con Chrome DevTools, dependencias, costo de
GPU y comportamiento móvil) está en [`docs/react-bits-research.md`](./react-bits-research.md).
Regla de cumplimiento (R28.3): **no se copia código de React Bits Pro**; todos
los efectos "adoptados" son **implementaciones propias** escritas desde cero,
adaptadas a los tokens del proyecto, que animan solo `opacity`/`transform` y
respetan `prefers-reduced-motion`, `Save-Data` y `pointer: coarse`.

Resumen de decisiones:

| Uso | Decisión | Materialización |
|-----|----------|-----------------|
| Fondo del hero (Aurora / Light Rays / Side Rays) | **Descartar** | WebGL (`ogl`/`three`) demasiado costoso en GPU de gama baja; se reemplaza por un **aurora/glow CSS propio** (`radial-gradient` + `blur` sobre tokens, p. ej. `bg-primary/10 blur-3xl`), sin `<canvas>`. No se añade ninguna dependencia WebGL. |
| H1 del hero (Blur Text / Split Text) | **Adaptar** | `components/ui/reveal-text.tsx`: revelado propio del H1 con Motion que anima **solo `transform`** (sin `filter`, R18.2), mantiene el texto visible en el primer paint (SSR) para no retrasar el LCP (R18.6) y es no-op bajo reduced-motion. |
| Tarjetas destacadas (Spotlight Card / Border Glow) | **Adoptar (propia)** | `components/offers/premium-spotlight.tsx`: spotlight + border-glow que solo mueven CSS custom props vía `requestAnimationFrame`, con la compuerta de efectos premium (ver abajo). |
| Feed en vivo (Animated List / Animated Content) | **Adoptar (propia)** | `components/offers/live-offer-item.tsx` sobre `lib/ui/motion` (`fadeInUp`): solo las inserciones en vivo animan; las tarjetas existentes no se re-montan (R9.4). |
| Estadísticas (Count Up) | **Descartar** | Honestidad rectora: no hay métricas reales que "contar"; animar una cifra sin dato vigente sería deshonesto (R13.5/R13.6). |
| Botones de escritorio (Magnet) | **Adaptar** | `components/ui/magnet.tsx`: efecto sutil solo escritorio (`pointer: fine`), `transform`-only, traslación pequeña, `rAF`-throttled y no-op bajo `pointer: coarse` / reduced-motion / `Save-Data`. La geometría es lógica pura en `lib/ui/magnet.ts`. |
| Hyperspeed / Ballpit / Splash Cursor | **Descartar** | En la lista de exclusión rectora (R28.4). |

### Compuerta de efectos premium (R14.4, R14.5)

La decisión de si una `OfferCard` puede renderizar su realce premium es **lógica
booleana pura**, separada de cualquier acceso al DOM/`matchMedia`, en
`lib/ui/premium-effects.ts` (`shouldEnablePremiumEffect`). El wrapper de cliente
lee las señales de runtime y las alimenta a esta función pura, que está cubierta
por la Propiedad 19.

Los efectos se habilitan **si y solo si** se cumplen las cinco condiciones:

```
isFeatured && isFirstRow && pointerFine && !reducedMotion && !saveData
```

Es decir: la tarjeta es **destacada** Y está en la **primera fila** Y el puntero
es **preciso** (`pointer: fine`, escritorio) Y **no** hay
`prefers-reduced-motion: reduce` Y **no** hay `Save-Data`. Basta una sola
condición adversa para desactivarlos (accesibilidad/rendimiento > diseño visual).

## Accesibilidad transversal

- HTML semántico, orden de encabezados correcto, skip link y foco visible (R25.1).
- Elementos decorativos marcados `aria-hidden`; nunca contenido esencial dentro
  de `canvas` (R25.7).
- La información esencial no se transmite solo por color (R25.5).
- Los avisos de Realtime usan `aria-live="polite"` de forma moderada (R25.6).

> La verificación completa de WCAG 2.2 AA requiere pruebas manuales con
> tecnología de asistencia y revisión experta; las auditorías automatizadas
> (axe) cubren una parte, no el total.
