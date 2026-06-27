import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  selectBestPhoto,
  type TelegramPhoto,
} from "@/lib/telegram/files";
import {
  DEFAULT_MAX_DIMENSION,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MIN_DIMENSION,
  validateImage,
} from "@/lib/telegram/images";

/**
 * Property-based test for the Image Processor's selection + validation.
 *
 * Feature: ofertas-reales-ia, Property 21: Selección y validación de imagen
 * Validates: Requirements 3.1, 3.3, 3.4
 *
 * Para cualquier arreglo `photo[]`, el Procesador de Imágenes selecciona la de
 * mayor resolución razonable (mayor `width*height` dentro de un tope); y para
 * cualquier archivo, la imagen se acepta si y solo si su MIME, tamaño,
 * extensión y dimensiones cumplen los límites.
 *
 * **Validates: Requirements 3.1, 3.3, 3.4**
 */

// --- Selection (R3.1) -------------------------------------------------------

const CAP = 1_000_000;

/** Positive dimensions up to 2000 px so areas straddle CAP (max area 4M). */
const usablePhotoArb: fc.Arbitrary<TelegramPhoto> = fc.record({
  file_id: fc.string({ minLength: 1, maxLength: 8 }),
  file_unique_id: fc.string({ minLength: 1, maxLength: 8 }),
  width: fc.integer({ min: 1, max: 2000 }),
  height: fc.integer({ min: 1, max: 2000 }),
  file_size: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: undefined }),
});

const area = (photo: TelegramPhoto): number => photo.width * photo.height;

describe("Property 21: Selección y validación de imagen", () => {
  // Feature: ofertas-reales-ia, Property 21: Selección y validación de imagen
  // Validates: Requirements 3.1
  it("selects the max-area photo within the cap (or the smallest when all exceed it)", () => {
    fc.assert(
      fc.property(
        fc.array(usablePhotoArb, { minLength: 1, maxLength: 8 }),
        (photos) => {
          const result = selectBestPhoto(photos, { maxArea: CAP });
          // Every generated photo is usable, so a selection always exists.
          expect(result).not.toBeNull();
          const chosen = result as TelegramPhoto;

          // The chosen photo is one of the inputs.
          expect(photos).toContainEqual(chosen);

          const withinCap = photos.filter((p) => area(p) <= CAP);
          if (withinCap.length > 0) {
            // Max area among those within the cap, and itself within the cap.
            expect(area(chosen)).toBeLessThanOrEqual(CAP);
            for (const p of withinCap) {
              expect(area(chosen)).toBeGreaterThanOrEqual(area(p));
            }
          } else {
            // All exceed the cap: the smallest area is chosen.
            for (const p of photos) {
              expect(area(chosen)).toBeLessThanOrEqual(area(p));
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 21: Selección y validación de imagen
  // Validates: Requirements 3.1
  it("returns null only when there is no usable photo", () => {
    const maybeBrokenArb = fc.record({
      file_id: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 6 })),
      file_unique_id: fc.string({ maxLength: 6 }),
      width: fc.integer({ min: -10, max: 1000 }),
      height: fc.integer({ min: -10, max: 1000 }),
      file_size: fc.constant<undefined>(undefined),
    });
    fc.assert(
      fc.property(fc.array(maybeBrokenArb, { maxLength: 8 }), (photos) => {
        const hasUsable = photos.some(
          (p) => p.file_id.length > 0 && p.width > 0 && p.height > 0,
        );
        const result = selectBestPhoto(photos, { maxArea: CAP });
        expect(result === null).toBe(!hasUsable);
      }),
      { numRuns: 300 },
    );
  });

  // --- Validation (R3.3, R3.4) ---------------------------------------------

  // Independent re-derivation of the accept predicate (the oracle).
  const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];
  const ALLOWED_FORMATS = ["jpeg", "jpg", "png", "webp"];

  const contentTypeArb = fc.constantFrom<string | null>(
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/html",
    null,
  );
  const formatArb = fc.constantFrom<string | null>(
    "jpeg",
    "png",
    "webp",
    "gif",
    "svg",
    null,
  );
  const sizeArb = fc.integer({ min: 0, max: 8_000_000 });
  const dimArb = fc.option(fc.integer({ min: 0, max: 8000 }), { nil: null });

  // Feature: ofertas-reales-ia, Property 21: Selección y validación de imagen
  // Validates: Requirements 3.3, 3.4
  it("accepts iff MIME, size, extension and dimensions all pass", () => {
    fc.assert(
      fc.property(
        contentTypeArb,
        sizeArb,
        formatArb,
        dimArb,
        dimArb,
        (contentType, sizeBytes, format, width, height) => {
          const mimeOk = contentType !== null && ALLOWED_MIMES.includes(contentType);
          const sizeOk = sizeBytes > 0 && sizeBytes <= DEFAULT_MAX_IMAGE_BYTES;
          const extOk =
            format !== null && ALLOWED_FORMATS.includes(format.toLowerCase());
          const dimsOk =
            width !== null && height !== null
              ? width >= DEFAULT_MIN_DIMENSION &&
                height >= DEFAULT_MIN_DIMENSION &&
                width <= DEFAULT_MAX_DIMENSION &&
                height <= DEFAULT_MAX_DIMENSION
              : true;
          const expected = mimeOk && sizeOk && extOk && dimsOk;

          const result = validateImage({ contentType, sizeBytes, format, width, height });
          expect(result.ok).toBe(expected);
        },
      ),
      { numRuns: 400 },
    );
  });

  // Feature: ofertas-reales-ia, Property 21: Selección y validación de imagen
  // Validates: Requirements 3.4
  it("always records a rejection reason when it does not accept", () => {
    fc.assert(
      fc.property(
        contentTypeArb,
        sizeArb,
        formatArb,
        dimArb,
        dimArb,
        (contentType, sizeBytes, format, width, height) => {
          const result = validateImage({ contentType, sizeBytes, format, width, height });
          if (!result.ok) {
            expect(typeof result.reason).toBe("string");
            expect(result.reason.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
