import { redirect } from "next/navigation";

import { TelegramStatusView } from "@/components/admin";
import { getAdminUser } from "@/lib/admin/session";
import { getTelegramWebhookStatus } from "@/lib/telegram/status";

/**
 * Admin Telegram webhook status page (Task 36 / R23.5, R10.2, R10.3).
 *
 * Server Component (`force-dynamic`) that re-verifies the admin session and
 * computes the {@link getTelegramWebhookStatus} snapshot server-side (calling
 * `getWebhookInfo` with the Bot Token, which stays on the server, and reading
 * `telegram_updates`). The snapshot — which never contains a secret — is handed
 * to the client {@link TelegramStatusView} for first paint and on-demand
 * refresh. Degrades to friendly states when no token is configured locally.
 */
export const dynamic = "force-dynamic";

export default async function AdminTelegramPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const status = await getTelegramWebhookStatus();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h4 font-semibold text-foreground">Estado del webhook</h1>
        <p className="text-body text-muted-foreground">
          Configuración del webhook de Telegram, última actualización recibida y errores recientes.
        </p>
      </header>
      <TelegramStatusView initialStatus={status} />
    </div>
  );
}
