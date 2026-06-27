/**
 * Public surface of the Telegram image module (R3).
 *
 * - `files`  — photo selection + token-safe file download via injected fetch
 *              (`selectBestPhoto`, `fetchTelegramFile`, `TelegramPhoto`).
 * - `images` — validation, safe filename, Storage upload + fallback
 *              (`validateImage`, `processOfferImage`).
 *
 * The production wiring (`lib/telegram/adapters.ts`) is **not** re-exported
 * here: it is `server-only` (reads `serverEnv`, `sharp`, the service-role
 * client) and must not be pulled in through this barrel by pure/testable code.
 */
export * from "@/lib/telegram/files";
export * from "@/lib/telegram/images";
