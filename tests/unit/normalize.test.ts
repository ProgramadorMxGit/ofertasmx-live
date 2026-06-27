import { describe, expect, it } from "vitest";

import {
  normalizeDestination,
  normalizeText,
  normalizeTitle,
} from "@/lib/parser/normalize";

/**
 * Example unit tests for message normalization (R4.1, R4.2, R4.3).
 *
 * These cover concrete examples and edge cases: unicode/NBSP/thin spaces,
 * zero-width and bidi invisibles, line-break unification, percent and currency
 * spacing, multiline-title collapsing, and destination canonicalization (used
 * by the fingerprint). Broad-input idempotency lives in the companion
 * property-based test (`normalize.property.test.ts`).
 */

describe("normalizeText — unicode spaces", () => {
  it("converts NBSP and thin/narrow spaces to a single regular space", () => {
    // NBSP (\u00a0), thin space (\u2009), narrow no-break (\u202f).
    expect(normalizeText("a\u00a0b")).toBe("a b");
    expect(normalizeText("a\u2009b")).toBe("a b");
    expect(normalizeText("a\u202fb")).toBe("a b");
    expect(normalizeText("$1\u00a0299.00")).toBe("$1 299.00");
  });

  it("collapses runs of spaces (including tabs) into one", () => {
    expect(normalizeText("a   b")).toBe("a b");
    expect(normalizeText("a\t\tb")).toBe("a b");
  });

  it("trims leading and trailing spaces per line and overall", () => {
    expect(normalizeText("   hola   ")).toBe("hola");
    expect(normalizeText("  a  \n  b  ")).toBe("a\nb");
  });
});

describe("normalizeText — invisible characters", () => {
  it("strips zero-width spaces, joiners and BOM", () => {
    expect(normalizeText("a\u200bb")).toBe("ab"); // zero-width space
    expect(normalizeText("a\u200db")).toBe("ab"); // zero-width joiner
    expect(normalizeText("a\ufeffb")).toBe("ab"); // BOM / zero-width no-break
    expect(normalizeText("a\u00adb")).toBe("ab"); // soft hyphen
  });

  it("strips bidi control marks", () => {
    expect(normalizeText("a\u200eb")).toBe("ab"); // LRM
    expect(normalizeText("a\u202bb")).toBe("ab"); // RLE
  });
});

describe("normalizeText — line breaks", () => {
  it("unifies CRLF, CR and unicode separators to LF", () => {
    expect(normalizeText("a\r\nb")).toBe("a\nb");
    expect(normalizeText("a\rb")).toBe("a\nb");
    expect(normalizeText("a\u2028b")).toBe("a\nb");
    expect(normalizeText("a\u2029b")).toBe("a\nb");
  });

  it("caps runs of blank lines at one", () => {
    expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("normalizeText — currency, decimals and percentages", () => {
  it("removes the space before a percent sign", () => {
    expect(normalizeText("60 %")).toBe("60%");
    expect(normalizeText("60\u00a0%")).toBe("60%");
  });

  it("normalizes fullwidth currency and percent symbols", () => {
    expect(normalizeText("\uff041,299")).toBe("$1,299"); // fullwidth $
    expect(normalizeText("60\uff05")).toBe("60%"); // fullwidth %
  });

  it("preserves the digits and separators of prices", () => {
    expect(normalizeText("Antes: $1,220.27")).toBe("Antes: $1,220.27");
  });
});

describe("normalizeText — idempotence on representative messages", () => {
  it("is a no-op on an already-normalized string", () => {
    const message =
      "Lugz Lear Tenis para Hombre\n🔥 60% de descuento\nAntes: $1,220.27\nAHORA: $487.22";
    const once = normalizeText(message);
    expect(normalizeText(once)).toBe(once);
  });

  it("handles empty input", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("normalizeTitle — lowercase, collapse, strip invisibles", () => {
  it("lowercases and collapses all whitespace into single spaces", () => {
    expect(normalizeTitle("  Lugz   Lear\tTENIS  ")).toBe("lugz lear tenis");
  });

  it("flattens a multiline title to a single line", () => {
    expect(normalizeTitle("Tenis Lugz\npara Hombre")).toBe("tenis lugz para hombre");
  });

  it("strips invisible characters", () => {
    expect(normalizeTitle("ten\u200bis")).toBe("tenis");
  });
});

describe("normalizeDestination — host + canonical product path", () => {
  it("drops the scheme, www, and tracking/UTM params", () => {
    expect(
      normalizeDestination(
        "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=programadormx-20&utm_source=telegram",
      ),
    ).toBe("amazon.com.mx/dp/b08z6z4p7c");
  });

  it("is stable regardless of surface formatting of the same destination", () => {
    const a = normalizeDestination(
      "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=abc",
    );
    const b = normalizeDestination(
      "https://amazon.com.mx/dp/B08Z6Z4P7C?utm_medium=x&tag=zzz",
    );
    expect(a).toBe(b);
  });

  it("preserves a non-tracking identifier query param", () => {
    expect(normalizeDestination("https://articulo.mercadolibre.com.mx/MLM-123?x=1")).toBe(
      "articulo.mercadolibre.com.mx/mlm-123?x=1",
    );
  });
});
