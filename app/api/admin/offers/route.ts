import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminAccess } from "@/lib/admin/session";
import { isKnownCategorySlug } from "@/lib/offers/categories";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Json, Tables, TablesUpdate } from "@/lib/supabase/types";

/**
 * `POST /api/admin/offers` — admin offer management with audit (Task 34.1 /
 * R23.2, R8.6, R7.7, R10.3).
 *
 * Two-layer security:
 *   1. **Authn/authz (defense in depth, beyond `middleware.ts`).** Re-verify the
 *      caller is an authenticated admin (session email ∈ `ADMIN_EMAIL`) via the
 *      cookie-scoped server client. No session → 401; not allowlisted → 403.
 *   2. **Privileged write.** Only *after* that check, mutate the offer through
 *      the **service-role** client (RLS-bypassing, server-only).
 *
 * Supported actions (validated with Zod): `edit` (title / category /
 * `image_alt` / editorial fields), `publish` (→ active), `hide` (→ hidden),
 * `expire` (→ expired), `feature` (toggle `is_featured`) and `retry_image`
 * (→ `image_status='pending'`). Every action writes one `admin_audit_logs` row
 * with the actor email and a **non-secret** field diff (R7.7, R8.6). Errors use
 * the shared `{ error: { code, message } }` shape.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuid = z.string().uuid();

/** Editorial fields an admin may correct (R23.3, R4.15). At least one required. */
const editFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    categorySlug: z.string().trim().min(1).max(64).optional(),
    image_alt: z.string().trim().max(300).nullable().optional(),
    editorial_summary: z.string().trim().max(5000).nullable().optional(),
    short_description: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((fields) => Object.values(fields).some((value) => value !== undefined), {
    message: "Indica al menos un campo para editar.",
  });

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), offerId: uuid, fields: editFieldsSchema }),
  z.object({ action: z.literal("publish"), offerId: uuid }),
  z.object({ action: z.literal("hide"), offerId: uuid }),
  z.object({ action: z.literal("expire"), offerId: uuid }),
  z.object({ action: z.literal("feature"), offerId: uuid, value: z.boolean() }),
  z.object({ action: z.literal("retry_image"), offerId: uuid }),
]);

type AdminAction = z.infer<typeof bodySchema>;

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  // 1) Authn/authz — defense in depth beyond the middleware (R10.4, R8.6).
  const access = await getAdminAccess();
  if (!access.ok) {
    return access.status === 401
      ? errorResponse(401, "unauthorized", "Inicia sesión para continuar.")
      : errorResponse(403, "forbidden", "Tu cuenta no tiene acceso de administrador.");
  }

  // 2) Validate the request body.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "El cuerpo de la solicitud no es válido.");
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse(400, "invalid_body", issue?.message ?? "Solicitud inválida.");
  }
  const command: AdminAction = parsed.data;

  const supabase = createServiceRoleClient();

  // 3) Load the current offer (service role: visible regardless of status).
  const { data: current, error: loadError } = await supabase
    .from("offers")
    .select("*")
    .eq("id", command.offerId)
    .maybeSingle<Tables<"offers">>();

  if (loadError) {
    return errorResponse(500, "load_failed", "No se pudo cargar la oferta.");
  }
  if (!current) {
    return errorResponse(404, "not_found", "La oferta no existe.");
  }

  // 4) Build the update + the non-secret diff for the audit log. The diff maps
  //    a field to a `{ from, to }` object; typing it `Record<string, Json>` lets
  //    object literals serialize straight into the `details` JSONB column.
  const updates: TablesUpdate<"offers"> = {};
  const diff: Record<string, Json> = {};

  if (command.action === "edit") {
    const { fields } = command;

    if (fields.title !== undefined && fields.title !== current.title) {
      updates.title = fields.title;
      diff.title = { from: current.title, to: fields.title };
    }
    if (fields.image_alt !== undefined && fields.image_alt !== current.image_alt) {
      updates.image_alt = fields.image_alt;
      diff.image_alt = { from: current.image_alt, to: fields.image_alt };
    }
    if (
      fields.editorial_summary !== undefined &&
      fields.editorial_summary !== current.editorial_summary
    ) {
      updates.editorial_summary = fields.editorial_summary;
      diff.editorial_summary = {
        from: current.editorial_summary,
        to: fields.editorial_summary,
      };
    }
    if (
      fields.short_description !== undefined &&
      fields.short_description !== current.short_description
    ) {
      updates.short_description = fields.short_description;
      diff.short_description = {
        from: current.short_description,
        to: fields.short_description,
      };
    }
    if (fields.categorySlug !== undefined) {
      if (!isKnownCategorySlug(fields.categorySlug)) {
        return errorResponse(400, "invalid_category", "La categoría no es válida.");
      }
      const { data: category, error: categoryError } = await supabase
        .from("offer_categories")
        .select("id")
        .eq("slug", fields.categorySlug)
        .maybeSingle<{ id: string }>();
      if (categoryError) {
        return errorResponse(500, "category_lookup_failed", "No se pudo asignar la categoría.");
      }
      if (!category) {
        return errorResponse(400, "invalid_category", "La categoría no existe.");
      }
      if (category.id !== current.category_id) {
        updates.category_id = category.id;
        diff.category_id = { from: current.category_id, to: category.id };
      }
    }
  } else if (command.action === "publish") {
    if (current.status !== "active") {
      updates.status = "active";
      diff.status = { from: current.status, to: "active" };
    }
  } else if (command.action === "hide") {
    if (current.status !== "hidden") {
      updates.status = "hidden";
      diff.status = { from: current.status, to: "hidden" };
    }
  } else if (command.action === "expire") {
    if (current.status !== "expired") {
      updates.status = "expired";
      diff.status = { from: current.status, to: "expired" };
    }
  } else if (command.action === "feature") {
    if (current.is_featured !== command.value) {
      updates.is_featured = command.value;
      diff.is_featured = { from: current.is_featured, to: command.value };
    }
  } else {
    // retry_image
    if (current.image_status !== "pending") {
      updates.image_status = "pending";
      diff.image_status = { from: current.image_status, to: "pending" };
    }
  }

  // 5) Apply the update (when something actually changed).
  let offer: Tables<"offers"> = current;
  if (Object.keys(updates).length > 0) {
    const { data: updated, error: updateError } = await supabase
      .from("offers")
      .update(updates)
      .eq("id", command.offerId)
      .select("*")
      .single<Tables<"offers">>();

    if (updateError) {
      // The DB CHECK `active_requires_affiliate` blocks publishing an offer with
      // no affiliate link — surface a friendly, specific message.
      if (
        command.action === "publish" &&
        /active_requires_affiliate/i.test(updateError.message)
      ) {
        return errorResponse(
          409,
          "missing_affiliate_url",
          "No se puede publicar la oferta sin un enlace de afiliado.",
        );
      }
      return errorResponse(500, "update_failed", "No se pudo actualizar la oferta.");
    }
    offer = updated;
  }

  // 6) Audit log — one row per action, with the actor + a non-secret diff
  //    (R7.7, R8.6). Best-effort: a logging failure must not undo the action.
  try {
    await supabase.from("admin_audit_logs").insert({
      actor_email: access.email,
      action: `offer.${command.action}`,
      offer_id: command.offerId,
      details: diff,
    });
  } catch {
    // Swallow: the offer mutation already succeeded.
  }

  return NextResponse.json({ ok: true, offer });
}
