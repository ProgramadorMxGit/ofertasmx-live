import { describe, expect, it } from "vitest";

import { isAdminEmail, parseAdminEmails } from "@/lib/admin/allowlist";

/**
 * Example unit tests for the pure admin allowlist resolution (Task 33.1 /
 * R10.6). The case-insensitive membership invariant is covered broadly in the
 * companion property test (`admin-allowlist.property.test.ts`, Property 22);
 * here we pin concrete examples and the parsing rules.
 */

describe("parseAdminEmails", () => {
  it("returns [] for a missing or empty value", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails(null)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails("   ")).toEqual([]);
    expect(parseAdminEmails(",")).toEqual([]);
    expect(parseAdminEmails(" , , ")).toEqual([]);
  });

  it("parses a single email, trimmed and lower-cased", () => {
    expect(parseAdminEmails("  Admin@Example.COM ")).toEqual(["admin@example.com"]);
  });

  it("parses several comma-separated emails", () => {
    expect(parseAdminEmails("a@x.com, B@Y.com ,c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("drops empty segments and de-duplicates (case-insensitively)", () => {
    expect(parseAdminEmails("a@x.com,,A@X.com, ,a@x.com")).toEqual(["a@x.com"]);
  });
});

describe("isAdminEmail", () => {
  it("matches a single allowlisted email case-insensitively", () => {
    expect(isAdminEmail("admin@example.com", "admin@example.com")).toBe(true);
    expect(isAdminEmail("ADMIN@example.com", "admin@example.com")).toBe(true);
    expect(isAdminEmail("  admin@EXAMPLE.com  ", "Admin@Example.com")).toBe(true);
  });

  it("matches one of several comma-separated emails", () => {
    const raw = "first@a.com, second@b.com , Third@C.com";
    expect(isAdminEmail("second@b.com", raw)).toBe(true);
    expect(isAdminEmail("THIRD@c.com", raw)).toBe(true);
    expect(isAdminEmail("nobody@d.com", raw)).toBe(false);
  });

  it("is false for an empty or missing email regardless of the allowlist", () => {
    expect(isAdminEmail(undefined, "admin@example.com")).toBe(false);
    expect(isAdminEmail(null, "admin@example.com")).toBe(false);
    expect(isAdminEmail("", "admin@example.com")).toBe(false);
    expect(isAdminEmail("   ", "admin@example.com")).toBe(false);
  });

  it("is false when the allowlist is empty or missing", () => {
    expect(isAdminEmail("admin@example.com", undefined)).toBe(false);
    expect(isAdminEmail("admin@example.com", "")).toBe(false);
    expect(isAdminEmail("admin@example.com", " , ")).toBe(false);
  });
});
