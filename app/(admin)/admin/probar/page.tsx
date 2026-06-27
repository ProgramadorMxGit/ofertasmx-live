import { redirect } from "next/navigation";

import { TestMessagePanel } from "@/components/admin";
import { getAdminUser } from "@/lib/admin/session";
import { serverEnv } from "@/lib/env.server";

/**
 * Admin "Probar mensaje" page (Task 35 / R23.6, R10.2).
 *
 * Server Component (`force-dynamic`) that re-verifies the admin session (defense
 * in depth beyond `middleware.ts`) and mounts the client {@link TestMessagePanel}.
 * It threads only the derived `SHOW_AMAZON_PRICES` boolean so the card preview
 * matches the public cards; the parsing itself runs in the panel's Server Action
 * (`analyzeMessageAction`), which re-checks the session and never persists.
 */
export const dynamic = "force-dynamic";

export default async function AdminTestMessagePage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h4 font-semibold text-foreground">Probar mensaje</h1>
        <p className="text-body text-muted-foreground">
          Pega un mensaje de Telegram para ver cómo lo interpretaría el sistema, sin publicarlo.
        </p>
      </header>
      <TestMessagePanel showAmazonPrices={serverEnv.SHOW_AMAZON_PRICES} />
    </div>
  );
}
