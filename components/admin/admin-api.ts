/**
 * Client helper for calling the admin offers API (Task 34.2).
 *
 * A thin, typed wrapper over `POST /api/admin/offers` shared by `AdminTable`
 * (quick actions) and `AdminOfferEditor` (edits + status changes). It never
 * throws: it resolves to a discriminated result so callers can show a friendly
 * message. The request body shape mirrors the Zod schema in the route handler.
 */

/** Editorial fields an admin may correct (mirrors the route's `editFieldsSchema`). */
export interface AdminEditFields {
  title?: string;
  categorySlug?: string;
  image_alt?: string | null;
  editorial_summary?: string | null;
  short_description?: string | null;
}

/** A management command sent to `POST /api/admin/offers`. */
export type AdminActionBody =
  | { action: "edit"; offerId: string; fields: AdminEditFields }
  | { action: "publish"; offerId: string }
  | { action: "hide"; offerId: string }
  | { action: "expire"; offerId: string }
  | { action: "feature"; offerId: string; value: boolean }
  | { action: "retry_image"; offerId: string };

/** Result of an admin action: success or a friendly, displayable message. */
export type AdminActionResult =
  | { ok: true }
  | { ok: false; message: string };

const FALLBACK_ERROR = "No se pudo completar la acción. Inténtalo de nuevo.";

/** Send an admin action and normalize the outcome. Never throws. */
export async function postAdminAction(
  body: AdminActionBody,
): Promise<AdminActionResult> {
  try {
    const response = await fetch("/api/admin/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.ok) return { ok: true };

    let message = FALLBACK_ERROR;
    try {
      const data: unknown = await response.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error?: { message?: unknown } }).error?.message === "string"
      ) {
        message = (data as { error: { message: string } }).error.message;
      }
    } catch {
      // Non-JSON error body — keep the fallback message.
    }
    return { ok: false, message };
  } catch {
    return { ok: false, message: FALLBACK_ERROR };
  }
}
