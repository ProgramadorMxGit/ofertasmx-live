import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { formatLogLine, type LogRecord } from "@/lib/telegram/secret";

/**
 * Property-based test for the secret-safe logger/redactor.
 *
 * Feature: ofertas-reales-ia, Property 15: Ausencia de secretos en logs y mensajes
 * Validates: Requirements 1.16, 27.5
 *
 * Para cualquier conjunto de valores secretos y cualquier línea de log o mensaje
 * de error (que los incluya en el mensaje, en campos anidados, bajo claves
 * secretas o en listas), la salida del redactor no contiene ninguno de los
 * valores secretos.
 */

// Secret-like tokens from a charset that has no '*' (the value mask) and no JSON
// metacharacters (`"`, `\`), so masking is exact and serialization is verbatim —
// matching the shape of real tokens (bot token, webhook secret, service key).
const secretValueArb = fc.stringOf(
  fc.constantFrom(
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.:".split(""),
  ),
  { minLength: 8, maxLength: 48 },
);

const secretsArb = fc.uniqueArray(secretValueArb, { minLength: 1, maxLength: 3 });

describe("Property 15: Ausencia de secretos en logs y mensajes", () => {
  // Feature: ofertas-reales-ia, Property 15: Ausencia de secretos en logs y mensajes
  // Validates: Requirements 1.16, 27.5
  it("never emits any configured secret value, wherever it appears", () => {
    fc.assert(
      fc.property(secretsArb, fc.string(), (secrets, noise) => {
        const first = secrets[0];
        const last = secrets[secrets.length - 1];

        // Deliberately leak the secrets in every channel a careless caller might
        // use: the free-text message, secret-named fields, non-secret fields,
        // nested objects and arrays.
        const record: LogRecord = {
          level: "error",
          message: `internal failure ${noise} token=${first} all=${secrets.join(",")}`,
          context: {
            authorization: first,
            telegram_bot_token: last,
            note: `leaked ${secrets.join(" ")} here`,
            nested: { supabase_service_role_key: first, detail: last },
            list: secrets,
            harmless: noise,
          },
        };

        const line = formatLogLine(record, { secretValues: secrets });

        for (const secret of secrets) {
          expect(line.includes(secret)).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });
});
