/**
 * Admin panel components (Tasks 33–36).
 *
 * `AdminHeader` is the admin chrome (Client); `AdminTable` and
 * `AdminOfferEditor` are the offers management UI (Client) backed by the
 * `/api/admin/offers` endpoint. `TestMessagePanel` is the "Probar mensaje"
 * dry-run (Client + Server Action, Task 35) and `TelegramStatusView` is the
 * webhook status view (Client, Task 36). All admin writes are re-verified
 * server-side and audited.
 */
export { AdminHeader } from "./admin-header";
export { AdminTable } from "./admin-table";
export type { AdminTableProps } from "./admin-table";
export { AdminOfferEditor } from "./admin-offer-editor";
export type { AdminOfferEditorProps } from "./admin-offer-editor";
export { TestMessagePanel } from "./test-message-panel";
export type { TestMessagePanelProps } from "./test-message-panel";
export { TelegramStatusView } from "./telegram-status-view";
export type { TelegramStatusViewProps } from "./telegram-status-view";
