import { z } from "zod";

/**
 * Environment validation (R27.3, R27.4, R27.5).
 *
 * This is the *neutral* part of env handling and is safe to import from both
 * Server and Client Components. It exposes:
 *   - the Zod schemas (`serverSchema`, `publicSchema`),
 *   - a pure, side-effect-free `validateEnv` helper (unit-testable in isolation
 *     from `process.env`),
 *   - the validated *public* environment (`publicEnv`).
 *
 * The *server* environment (secrets + server-only config) lives in
 * `lib/env.server.ts`, which is marked `server-only` so any accidental import
 * from a Client Component is a build error. That keeps
 * `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
 * and `CRON_SECRET` out of the browser bundle (R27.2, R8.7).
 *
 * A single file cannot host both `serverEnv` (server-only) and `publicEnv`
 * (client-safe) — `import "server-only"` poisons the whole module — so the
 * server portion is split out. The schemas and the pure validator stay here so
 * tests and both env loaders can reuse them.
 */

/**
 * Coerce common string representations of booleans coming from env vars.
 *
 * Unlike `z.coerce.boolean()` (where `Boolean("false") === true`, so the string
 * "false" would wrongly become `true`), this maps "false"/"0"/"no"/"off"/""
 * to `false`. That makes a toggle like `SHOW_AMAZON_PRICES=false` actually work
 * (R22.2), which matters because env values are always strings.
 */
const envBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value, ctx): boolean => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must be a boolean-like value (true/false)",
    });
    return z.NEVER;
  });

/** Server-only variables. Never prefixed with `NEXT_PUBLIC_` (R27.2). */
export const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_ALLOWED_CHAT_ID: z.coerce.number().int(), // 5054325626
  ADMIN_EMAIL: z.string().min(3), // uno o varios correos separados por coma
  AMAZON_TRACKING_ID: z.string().default("programadormx-20"),
  SHOW_AMAZON_PRICES: envBoolean.default(true),
  CRON_SECRET: z.string().min(1),
  /** API key for the quick-offer REST endpoint (optional — omit to disable). */
  QUICK_OFFER_API_KEY: z.string().min(16).optional(),
});

/** Public variables. Inlined into the browser bundle — never secrets (R27.2). */
export const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url(), // https://programadormx.online
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_WHATSAPP_INVITE_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

/**
 * Error thrown when env validation fails. The message lists only variable
 * NAMES and generic reasons — never values — so secrets cannot leak into logs
 * or error output (R27.5).
 */
export class EnvValidationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[], context: string) {
    super(
      `Invalid ${context}. Check these variables: ${variables.join(", ")}. ` +
        "Variable values are omitted from this message for security.",
    );
    this.name = "EnvValidationError";
    this.variables = variables;
  }
}

/** Map a Zod issue code to a value-free, human-readable reason. */
function describeIssue(code: z.ZodIssueCode): string {
  switch (code) {
    case z.ZodIssueCode.invalid_type:
      return "missing or wrong type";
    case z.ZodIssueCode.too_small:
      return "must not be empty";
    case z.ZodIssueCode.invalid_string:
      return "must be a valid string/URL";
    default:
      return "invalid";
  }
}

/**
 * Pure, side-effect-free validation. Tests call this with a synthetic record,
 * so the validation logic is exercised without touching the real `process.env`.
 * On failure it throws an {@link EnvValidationError} whose message contains
 * variable NAMES only (R27.4, R27.5).
 */
export function validateEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: Record<string, unknown>,
  context = "environment configuration",
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const variables = [
    ...new Set(
      result.error.issues.map((issue) => {
        const name = issue.path.join(".") || "(root)";
        return `${name} (${describeIssue(issue.code)})`;
      }),
    ),
  ];
  throw new EnvValidationError(variables, context);
}

/**
 * Whether `SKIP_ENV_VALIDATION` is set to a truthy value.
 *
 * This is a **build-time only** escape hatch. `next build` runs with
 * `NODE_ENV=production`, so without it the production throw below would abort a
 * build performed in an environment that has no real secrets (e.g. a CI image
 * build, or `npm run build` on a fresh checkout). It MUST NOT be set in a
 * production *runtime*, where failing fast on a missing variable is exactly the
 * desired behaviour (R27.4). Falsey-looking strings ("", "false", "0", "no",
 * "off") are treated as not set.
 */
function shouldSkipEnvValidation(): boolean {
  const raw = process.env.SKIP_ENV_VALIDATION;
  if (typeof raw !== "string") return false;
  return !["", "false", "0", "no", "off"].includes(raw.trim().toLowerCase());
}

/**
 * Validate at module load. In production a failure throws to abort startup
 * (R27.4). Outside production — or during a build that opted out via
 * `SKIP_ENV_VALIDATION` — we warn (names only, R27.5) and fall back to the raw
 * source so local/dev/test flows and credential-free builds are not blocked by
 * an incomplete `.env`.
 */
function loadEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: Record<string, unknown>,
  context: string,
): z.infer<TSchema> {
  try {
    return validateEnv(schema, source, context);
  } catch (error) {
    // Production fails fast (R27.4) — UNLESS this is a build-time run that
    // explicitly opted out via SKIP_ENV_VALIDATION, where we degrade just like
    // the non-production path instead of aborting the build.
    if (process.env.NODE_ENV === "production" && !shouldSkipEnvValidation()) {
      throw error;
    }
    if (error instanceof EnvValidationError && process.env.NODE_ENV !== "test") {
      // Names only — never values (R27.5).
      console.warn(`[env] ${error.message}`);
    }
    // Dev/test/build fallback: do not crash the import; a real production
    // runtime (without SKIP_ENV_VALIDATION) already threw above.
    return source as unknown as z.infer<TSchema>;
  }
}

/**
 * Validated public environment. Each `NEXT_PUBLIC_*` var is referenced
 * statically so the Next.js bundler can inline it for the browser; do not
 * iterate over `process.env` here.
 */
export const publicEnv: PublicEnv = loadEnv(
  publicSchema,
  {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_WHATSAPP_INVITE_URL: process.env.NEXT_PUBLIC_WHATSAPP_INVITE_URL,
  },
  "public environment configuration",
);

/**
 * Load + validate the server environment. Used only by `lib/env.server.ts`
 * (server-only). Kept here so it shares the schema and validator, and so unit
 * tests can drive it with a synthetic source if needed.
 */
export function loadServerEnv(
  source: Record<string, unknown> = process.env,
): ServerEnv {
  return loadEnv(serverSchema, source, "server environment configuration");
}
