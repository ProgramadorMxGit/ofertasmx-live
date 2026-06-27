# Cumplimiento de afiliados y honestidad — Ofertas Reales IA

Este documento reúne las obligaciones de divulgación de afiliados, el manejo de
enlaces y el tratamiento honesto de precios. La **confianza** del visitante es un
objetivo de diseño explícito y el **principio de honestidad** es rector: el
Sistema nunca inventa datos.

## Divulgaciones obligatorias (R21.1)

El Sitio Web muestra, de forma visible:

- La divulgación específica de Amazon: **"Como Afiliado de Amazon, gano por
  compras elegibles."**
- Una **divulgación general** de enlaces de afiliado, que explica que algunos
  enlaces son de afiliado y que la plataforma puede ganar una comisión **sin
  costo adicional para el comprador**.

## Etiquetado y enlaces externos (R21.2, R11)

- **Etiqueta "Enlace de afiliado"** visible cerca de los botones/CTAs externos,
  para que el visitante sepa la naturaleza del enlace antes de activarlo (R21.2).
- Los botones de compra externos se renderizan con
  `rel="sponsored nofollow noopener"` (R11.1).
- Todo clic externo se encamina a través del redirector
  **`/api/click/[offerId]`** (R11.2), que valida que la oferta exista, registra
  analítica mínima y redirige **únicamente** a la `affiliate_url` almacenada,
  evitando redirecciones abiertas (ver [`security.md`](./security.md)).

## Preservación y verificación del tag de afiliado (R5.6–R5.8)

- **Amazon.** El parámetro de afiliado (`tag`) presente en una URL de Amazon se
  **preserva tal cual** y **nunca** se reemplaza en silencio por uno de un
  tercero (R5.6). El tag observado se compara con `AMAZON_TRACKING_ID` (valor por
  defecto `programadormx-20`); si **no coincide**, la oferta se marca con
  `needs_review = true` **sin alterar** el enlace original (R5.7, R5.8). El tag
  observado se guarda en `offers.affiliate_tag` para auditoría.
- **Mercado Libre.** Se detecta el identificador `MLM` cuando está disponible, se
  **preserva un enlace de afiliado válido** y se **conservan los parámetros de
  atribución** (R5.9).

Este comportamiento (preservar el `tag` de entrada y marcar revisión ante
discrepancia) está verificado por la Propiedad 9.

## Tratamiento honesto de precios (R22)

- **Frescura visible (R22.1).** Junto al precio se muestra "Última actualización:
  hace X minutos" y una **advertencia** de que el precio y la disponibilidad
  **pueden cambiar** en el comercio. El precio mostrado es el último detectado,
  no una garantía.
- **Conmutador `SHOW_AMAZON_PRICES` (R22.2).** Cuando está **desactivado**, para
  ofertas de plataforma Amazon la UI **oculta** el valor numérico del precio y
  muestra en su lugar **"Consulta el precio actual en Amazon"**. El dato sigue
  almacenado pero no se renderiza, y los datos estructurados omiten el precio.
  Para Mercado Libre no aplica. Verificado por la Propiedad 24.
- **Sin scraping desde el navegador (R22.3).** Nunca se ejecuta scraping desde el
  navegador del visitante. Los precios provienen del mensaje de Telegram parseado
  en el servidor.
- **Arquitectura preparada (R22.4).** La capa de presentación está diseñada para
  integrar después una API oficial de producto sin reescribir la interfaz.

### Datos estructurados honestos (R20.4–R20.6)

El JSON-LD `Product`/`Offer` se incluye **solo** cuando la oferta es real y
vigente; se **excluye** la marca de disponibilidad para ofertas expiradas; y si
no se garantiza la exactitud del precio, el precio se **omite** del dato
estructurado. Verificado por la Propiedad 20.

## Página `/transparencia-afiliados` (R21.3)

La plataforma provee la página pública **`/transparencia-afiliados`**, que
explica al visitante:

- **Qué es un enlace de afiliado** y cómo financia el sitio.
- Que el **precio para el usuario no aumenta** por usar estos enlaces.
- Que los **precios y la disponibilidad pueden cambiar** en el comercio.
- Que el sitio **no es** Amazon ni Mercado Libre (es independiente).
- **Cómo se seleccionan** las ofertas.
- **Qué partes del proceso son automáticas** (sin afirmar verificación humana si
  no la hay).
- **Cómo reportar** una oferta expirada o incorrecta.

## Política de valor editorial (R21.4, R21.5)

- **No copiar descripciones íntegras** de los comercios. El contenido añade
  **valor editorial propio**: resúmenes, contexto, categorías útiles, comparación
  con el precio anterior, hora de detección y advertencias (R21.4).
- **No inventar afirmaciones.** Los campos editoriales que no se pueden derivar
  del mensaje permanecen vacíos o en `needs_review` hasta acción del
  Administrador; no se generan automáticamente afirmaciones no verificadas
  (R21.5).

## Principio de honestidad (rector)

El Sistema **nunca** inventa datos. En particular, **no** se generan ni muestran:

- reseñas o calificaciones inventadas;
- existencias o niveles de stock falsos;
- contadores de urgencia, "personas comprando ahora" o cuentas regresivas falsas;
- cifras de ventas o de ahorros agregados sin fundamento;
- insignias de "verificado" que no sean ciertas.

La barra de confianza de la página de inicio usa **solo** indicadores honestos
(actualización en tiempo real, enlaces verificados, Amazon y Mercado Libre,
gratis para compradores) y excluye cualquier cifra inventada de usuarios, ventas
o ahorros (R13.5, R13.6). La sección "Cómo funciona" es honesta sobre qué partes
del proceso son automáticas y no afirma verificación humana si no es cierta
(R13.9).
