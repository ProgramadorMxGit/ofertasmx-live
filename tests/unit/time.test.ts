import { describe, expect, it } from "vitest";

import { formatAbsoluteDateEs, formatRelativeTimeEs } from "@/lib/utils/time";

/**
 * Unit tests for the pure time formatters used by `OfferCard` metadata
 * (R14.1, R22.1). `now` is injected so the relative output is deterministic.
 */

const NOW = new Date("2024-05-01T12:00:00.000Z");

function isoMinutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("formatRelativeTimeEs", () => {
  it("collapses sub-minute and future timestamps to 'justo ahora'", () => {
    expect(formatRelativeTimeEs(isoMinutesAgo(0), NOW)).toBe("justo ahora");
    expect(formatRelativeTimeEs(new Date(NOW.getTime() + 5_000).toISOString(), NOW)).toBe(
      "justo ahora",
    );
  });

  it("formats minutes, hours and days", () => {
    expect(formatRelativeTimeEs(isoMinutesAgo(5), NOW)).toBe("hace 5 min");
    expect(formatRelativeTimeEs(isoMinutesAgo(60), NOW)).toBe("hace 1 h");
    expect(formatRelativeTimeEs(isoMinutesAgo(60 * 24 * 2), NOW)).toBe("hace 2 d");
  });

  it("returns an empty string for an invalid timestamp", () => {
    expect(formatRelativeTimeEs("not-a-date", NOW)).toBe("");
  });
});

describe("formatAbsoluteDateEs", () => {
  it("formats a UTC date deterministically", () => {
    expect(formatAbsoluteDateEs("2024-05-01T12:00:00.000Z")).toBe("1 may 2024");
    expect(formatAbsoluteDateEs("2024-12-31T23:59:00.000Z")).toBe("31 dic 2024");
  });

  it("returns an empty string for an invalid timestamp", () => {
    expect(formatAbsoluteDateEs("nope")).toBe("");
  });
});
