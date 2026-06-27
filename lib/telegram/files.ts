/**
 * Telegram photo selection + file download (R3.1, R3.2).
 *
 * Pure-by-injection server logic for the Image Processor. This module:
 *  - {@link selectBestPhoto} — picks the highest *reasonable* resolution from a
 *    Telegram `photo[]` (largest `width*height` under a sane cap, R3.1);
 *  - {@link fetchTelegramFile} — calls `getFile` and downloads the bytes through
 *    an **injected** `fetch`, with a timeout and a maximum-size guard (R3.2).
 *
 * SECURITY (R3.2, R3.6, R1.16): the Bot Token is used **only** here, server-
 * side, to build the `getFile`/download URLs in memory. It is injected (read
 * from `serverEnv.TELEGRAM_BOT_TOKEN` by the production adapter, supplied as a
 * fixture in tests) and is **never** logged and **never** returned. The result
 * carries the raw bytes and the token-free Telegram `file_path` only — never the
 * tokened download URL — so the caller can store a stable Supabase Storage URL
 * instead of a temporary, token-bearing Telegram URL.
 *
 * No `lib/env.server` import lives here on purpose: keeping the token injected
 * (not read from the module) is what makes the download path testable with
 * fixtures and no real bot. The production wiring lives in
 * `lib/telegram/adapters.ts` (`server-only`).
 */

/**
 * Minimal shape of a Telegram `PhotoSize` (the entries of a message `photo[]`).
 *
 * Declared locally and exported so the Image Processor needs no I/O types; the
 * Telegram webhook (Task 14) formalizes the full Zod `Update` schema and reuses
 * this type for its `photo` field, keeping a single shared definition.
 */
export interface TelegramPhoto {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

/**
 * Sane upper bound on the selected photo's area (`width*height`), ≈ 4096².
 * Telegram's `photo[]` always includes down-scaled sizes, so capping the area
 * avoids picking an absurdly large render while still preferring high res.
 */
export const DEFAULT_MAX_PHOTO_AREA = 16_777_216;

/** Options for {@link selectBestPhoto}. */
export interface SelectPhotoOptions {
  /** Maximum allowed `width*height`. Defaults to {@link DEFAULT_MAX_PHOTO_AREA}. */
  maxArea?: number;
}

function photoArea(photo: TelegramPhoto): number {
  return photo.width * photo.height;
}

/** A photo is usable only with a non-empty id and positive, finite dimensions. */
function isUsablePhoto(photo: TelegramPhoto): boolean {
  return (
    typeof photo.file_id === "string" &&
    photo.file_id.length > 0 &&
    Number.isFinite(photo.width) &&
    Number.isFinite(photo.height) &&
    photo.width > 0 &&
    photo.height > 0
  );
}

/**
 * Selects the best photo from a Telegram `photo[]` (R3.1).
 *
 * Returns the **maximum-area** photo among those whose area is within the cap.
 * When every usable photo exceeds the cap, returns the **smallest** one (the
 * least-bad, safest choice rather than nothing). Returns `null` when there is no
 * usable photo (empty array or all entries with non-positive dimensions). The
 * choice is deterministic: on equal areas the earliest entry wins.
 */
export function selectBestPhoto(
  photos: readonly TelegramPhoto[],
  options: SelectPhotoOptions = {},
): TelegramPhoto | null {
  const maxArea = options.maxArea ?? DEFAULT_MAX_PHOTO_AREA;
  const usable = photos.filter(isUsablePhoto);
  if (usable.length === 0) return null;

  const withinCap = usable.filter((photo) => photoArea(photo) <= maxArea);
  if (withinCap.length > 0) {
    // Largest resolution that still fits under the cap.
    return withinCap.reduce((best, photo) =>
      photoArea(photo) > photoArea(best) ? photo : best,
    );
  }
  // Everything is over the cap: take the smallest available.
  return usable.reduce((best, photo) =>
    photoArea(photo) < photoArea(best) ? photo : best,
  );
}

// --- File download (injected fetch) ----------------------------------------

/** Minimal subset of `Headers` the downloader depends on. */
export interface MinimalHeaders {
  get(name: string): string | null;
}

/** Minimal subset of `Response` the downloader depends on. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: MinimalHeaders;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Injected fetch. The production adapter wraps the global `fetch`. */
export type TelegramFetchFn = (
  url: string,
  init: { method: string; signal: AbortSignal },
) => Promise<FetchResponseLike>;

/** Input for {@link fetchTelegramFile}. */
export interface FetchTelegramFileParams {
  fileId: string;
}

/** Injected dependencies + limits for {@link fetchTelegramFile}. */
export interface FetchTelegramFileDeps {
  /** Bot Token — used only to build the API URLs in memory; never logged. */
  token: string;
  /** Injected fetch (real `fetch` in production, a fixture in tests). */
  fetch: TelegramFetchFn;
  /** Per-request timeout in milliseconds. Defaults to 2500. */
  timeoutMs?: number;
  /** Maximum download size in bytes. Defaults to 10 MB. */
  maxBytes?: number;
  /** Telegram API base. Defaults to `https://api.telegram.org`. */
  apiBaseUrl?: string;
}

/** Why {@link fetchTelegramFile} failed. Generic codes — never leak URLs/token. */
export type FetchFileRejectionReason =
  | "invalid_file_id"
  | "getfile_failed"
  | "missing_file_path"
  | "download_failed"
  | "too_large"
  | "empty"
  | "timeout"
  | "network_error";

/** The downloaded bytes plus token-free metadata. */
export interface DownloadedFile {
  bytes: Uint8Array;
  /** Telegram `file_path` (e.g. `photos/file_42.jpg`). Carries NO token. */
  filePath: string;
  /** Declared `content-type` of the download, when present. */
  contentType: string | null;
  sizeBytes: number;
}

/** Discriminated result of {@link fetchTelegramFile}. */
export type FetchFileResult =
  | ({ ok: true } & DownloadedFile)
  | { ok: false; reason: FetchFileRejectionReason };

const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_DOWNLOAD_BYTES = 10_000_000;
const DEFAULT_API_BASE_URL = "https://api.telegram.org";

/** Shape of a successful `getFile` response (only the field we need). */
function readFilePath(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const root = payload as Record<string, unknown>;
  if (root.ok !== true) return null;
  const result = root.result;
  if (typeof result !== "object" || result === null) return null;
  const filePath = (result as Record<string, unknown>).file_path;
  return typeof filePath === "string" && filePath.length > 0 ? filePath : null;
}

/** Reads `content-length`; returns `true` when it advertises more than `max`. */
function exceedsAdvertisedSize(headers: MinimalHeaders, max: number): boolean {
  const header = headers.get("content-length");
  if (header === null) return false;
  const length = Number(header);
  return Number.isFinite(length) && length > max;
}

/**
 * Fetches a Telegram file by id (R3.2): `getFile` to obtain the `file_path`,
 * then download the bytes via the injected `fetch`, enforcing a timeout and a
 * maximum size. The Bot Token is used only to build the request URLs and is
 * never logged nor included in the result (which returns the bytes and the
 * token-free `file_path`).
 */
export async function fetchTelegramFile(
  params: FetchTelegramFileParams,
  deps: FetchTelegramFileDeps,
): Promise<FetchFileResult> {
  const {
    token,
    fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_DOWNLOAD_BYTES,
    apiBaseUrl = DEFAULT_API_BASE_URL,
  } = deps;

  if (params.fileId.length === 0) {
    return { ok: false, reason: "invalid_file_id" };
  }

  const base = apiBaseUrl.replace(/\/+$/, "");
  // These URLs embed the token; they stay in memory and are never logged/returned.
  const getFileUrl = `${base}/bot${token}/getFile?file_id=${encodeURIComponent(
    params.fileId,
  )}`;

  // 1) getFile -> file_path
  const getFileResponse = await timedFetch(fetch, getFileUrl, timeoutMs);
  if (getFileResponse.kind !== "ok") {
    return { ok: false, reason: getFileResponse.kind };
  }
  if (!getFileResponse.response.ok) {
    return { ok: false, reason: "getfile_failed" };
  }
  let payload: unknown;
  try {
    payload = await getFileResponse.response.json();
  } catch {
    return { ok: false, reason: "getfile_failed" };
  }
  const filePath = readFilePath(payload);
  if (filePath === null) {
    return { ok: false, reason: "missing_file_path" };
  }

  // 2) download bytes
  const downloadUrl = `${base}/file/bot${token}/${filePath}`;
  const downloadResponse = await timedFetch(fetch, downloadUrl, timeoutMs);
  if (downloadResponse.kind !== "ok") {
    return { ok: false, reason: downloadResponse.kind };
  }
  const response = downloadResponse.response;
  if (!response.ok) {
    return { ok: false, reason: "download_failed" };
  }
  if (exceedsAdvertisedSize(response.headers, maxBytes)) {
    return { ok: false, reason: "too_large" };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    return { ok: false, reason: "download_failed" };
  }
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength === 0) {
    return { ok: false, reason: "empty" };
  }
  if (bytes.byteLength > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  return {
    ok: true,
    bytes,
    filePath,
    contentType: response.headers.get("content-type"),
    sizeBytes: bytes.byteLength,
  };
}

/** Outcome of a single timed fetch; error variants are timeout/network only. */
type TimedFetch =
  | { kind: "ok"; response: FetchResponseLike }
  | { kind: "timeout" }
  | { kind: "network_error" };

/** Runs one fetch with an abort-on-timeout guard; never logs the URL/token. */
async function timedFetch(
  fetch: TelegramFetchFn,
  url: string,
  timeoutMs: number,
): Promise<TimedFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return { kind: "ok", response };
  } catch {
    return { kind: controller.signal.aborted ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
