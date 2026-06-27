/**
 * Keyword-based category classifier (R4.14).
 *
 * Maps a product title to exactly one category from a fixed, filter-aligned set
 * (R16.1). The classifier is a **total function**: every possible title yields a
 * category, falling back to `Otros` when no keyword matches. The keyword map is
 * configurable (injectable) so the Admin panel / future tuning can extend it
 * without touching the algorithm. Pure logic, no I/O (R29.1).
 *
 * Matching is accent- and case-insensitive: both the title and the keywords are
 * folded (lowercased, whitespace-collapsed, diacritics removed) before a
 * substring test, so "AUDIFONOS" matches the keyword "audífonos".
 */

import { normalizeTitle } from "@/lib/parser/normalize";

/** The closed set of categories (the last, `Otros`, is the total fallback). */
export const CATEGORIES = [
  "Electrónica",
  "Hogar",
  "Moda",
  "Herramientas",
  "Oficina",
  "Belleza",
  "Deportes",
  "Otros",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Fallback category when no keyword matches (R4.14). */
export const DEFAULT_CATEGORY: Category = "Otros";

/** Categories tried, in priority order, before the `Otros` fallback. */
const CATEGORY_ORDER: Exclude<Category, "Otros">[] = [
  "Electrónica",
  "Hogar",
  "Moda",
  "Herramientas",
  "Oficina",
  "Belleza",
  "Deportes",
];

/**
 * Configurable keyword map (R4.14). Keywords may be written with or without
 * accents; they are folded before matching. Lists are intentionally specific to
 * limit cross-category collisions; ties are broken by {@link CATEGORY_ORDER}.
 */
export const CATEGORY_KEYWORDS: Record<Exclude<Category, "Otros">, string[]> = {
  Electrónica: [
    "audífonos", "audifonos", "auriculares", "bocina", "bafle", "altavoz",
    "laptop", "notebook", "computadora", "celular", "smartphone", "teléfono",
    "televisor", "televisión", "pantalla", "tablet", "monitor", "teclado",
    "mouse", "cámara", "webcam", "consola", "xbox", "playstation", "nintendo",
    "cargador", "power bank", "powerbank", "ssd", "disco duro", "router",
    "modem", "smartwatch", "reloj inteligente", "bluetooth", "proyector",
  ],
  Hogar: [
    "licuadora", "olla", "sartén", "cafetera", "aspiradora", "refrigerador",
    "microondas", "horno", "estufa", "ventilador", "sábanas", "colchón",
    "almohada", "cobija", "edredón", "vajilla", "cocina", "mueble", "sofá",
    "lámpara", "cortina", "batidora", "tostador", "organizador", "freidora de aire",
  ],
  Moda: [
    "tenis", "zapatos", "zapatillas", "playera", "camisa", "camiseta", "blusa",
    "pantalón", "jeans", "vestido", "falda", "chamarra", "chaqueta", "sudadera",
    "suéter", "abrigo", "mochila", "bolsa", "bolso", "cartera", "gorra",
    "sombrero", "sandalias", "botas", "calcetines", "reloj",
  ],
  Herramientas: [
    "taladro", "destornillador", "desarmador", "martillo", "sierra", "serrucho",
    "llave", "pinzas", "kit de herramientas", "caja de herramientas",
    "atornillador", "esmeriladora", "lijadora", "compresor", "soldadora",
    "cinta métrica", "flexómetro", "broca",
  ],
  Oficina: [
    "impresora", "escáner", "escritorio", "silla de oficina", "cuaderno",
    "libreta", "pluma", "bolígrafo", "lápiz", "papelería", "tóner", "cartucho",
    "engrapadora", "archivero", "calculadora", "folder", "carpeta",
  ],
  Belleza: [
    "maquillaje", "labial", "rubor", "perfume", "fragancia", "loción", "shampoo",
    "champú", "acondicionador", "rasuradora", "afeitadora", "secadora de cabello",
    "plancha de cabello", "rizadora", "skincare", "serum", "mascarilla",
    "protector solar", "esmalte", "crema facial",
  ],
  Deportes: [
    "bicicleta", "pesas", "mancuernas", "yoga", "balón", "pelota",
    "casa de campaña", "tienda de campaña", "patines", "patineta", "caminadora",
    "elíptica", "proteína", "suplemento", "raqueta", "cuerda para saltar",
    "banco de ejercicio",
  ],
};

/** Lowercases, collapses whitespace and strips diacritics for tolerant matching. */
function fold(value: string): string {
  return normalizeTitle(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Classifies a title into one of {@link CATEGORIES}. Total: returns
 * {@link DEFAULT_CATEGORY} (`Otros`) when no keyword from any category matches.
 */
export function classifyCategory(
  title: string,
  keywords: Record<Exclude<Category, "Otros">, string[]> = CATEGORY_KEYWORDS,
): Category {
  const folded = fold(title);
  for (const category of CATEGORY_ORDER) {
    for (const keyword of keywords[category]) {
      if (folded.includes(fold(keyword))) {
        return category;
      }
    }
  }
  return DEFAULT_CATEGORY;
}
