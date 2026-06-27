import { notFound, redirect } from "next/navigation";

import { AdminOfferEditor } from "@/components/admin";
import { getAdminUser } from "@/lib/admin/session";
import { serverEnv } from "@/lib/env.server";
import { OFFER_CATEGORIES } from "@/lib/offers/categories";
import { isUuid } from "@/lib/offers/query";
import { verifyAmazonTag } from "@/lib/ssrf/identify";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

/**
 * Admin offer editor page (Task 34.2 / R23.3, R23.4, R23.5, R4.15, R10.2).
 *
 * Server Component (`force-dynamic`) that re-verifies the admin session, loads
 * the full offer (authenticated client — RLS `is_admin()` sees every row), its
 * category slug, and its `admin_audit_logs` history, then computes the Amazon
 * tracking-id check server-side (reusing `verifyAmazonTag`, R5.7/R5.8) and hands
 * everything to the client {@link AdminOfferEditor}. The service-role writes
 * happen only through `/api/admin/offers`, after re-checking the admin session.
 */
export const dynamic = "force-dynamic";

export default async function AdminOfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  if (!isUuid(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: offer } = await supabase
    .from("offers")
    .select("*")
    .eq("id", id)
    .maybeSingle<Tables<"offers">>();

  if (!offer) notFound();

  // Resolve the current category slug for the editor's select.
  let currentCategorySlug: string | null = null;
  if (offer.category_id) {
    const { data: category } = await supabase
      .from("offer_categories")
      .select("slug")
      .eq("id", offer.category_id)
      .maybeSingle<{ slug: string }>();
    currentCategorySlug = category?.slug ?? null;
  }

  const { data: auditLogs } = await supabase
    .from("admin_audit_logs")
    .select("*")
    .eq("offer_id", id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Tables<"admin_audit_logs">[]>();

  // Amazon tracking-id check (R5.7, R5.8): flag a mismatch without altering the
  // stored link. Non-Amazon offers or offers without a link skip the check.
  const tagCheck =
    offer.platform === "amazon" && offer.affiliate_url
      ? {
          ...verifyAmazonTag(offer.affiliate_url, serverEnv.AMAZON_TRACKING_ID),
          expected: serverEnv.AMAZON_TRACKING_ID,
        }
      : null;

  return (
    <AdminOfferEditor
      offer={offer}
      auditLogs={auditLogs ?? []}
      categories={OFFER_CATEGORIES}
      currentCategorySlug={currentCategorySlug}
      tagCheck={tagCheck}
      showAmazonPrices={serverEnv.SHOW_AMAZON_PRICES}
    />
  );
}
