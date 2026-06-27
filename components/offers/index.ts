/**
 * Public offer UI components (Tasks 22–24).
 *
 * `OfferCard` is a Server Component with small Client islands (`ShareButton`,
 * `RelativeTime`, `PremiumSpotlight`). `OfferGrid`, `OfferList`, `Filters`,
 * `SearchCommand`, `ConnectionIndicator`, `NewOffersNotice` and `LiveOfferItem`
 * are Client Components (they own URL/realtime/keyboard state). `useOffersRealtime`
 * is the Client hook that drives the live feed (Task 24).
 */
export { OfferCard } from "./offer-card";
export type { OfferCardProps } from "./offer-card";
export { OfferGrid } from "./offer-grid";
export type { OfferGridProps } from "./offer-grid";
export { LiveOffersSection } from "./live-offers-section";
export type { LiveOffersSectionProps } from "./live-offers-section";
export { OffersBrowser } from "./offers-browser";
export type { OffersBrowserProps, BrowserFilters } from "./offers-browser";
export { OfferDetail } from "./offer-detail";
export type { OfferDetailProps } from "./offer-detail";
export { RelatedOffers } from "./related-offers";
export type { RelatedOffersProps } from "./related-offers";
export { OfferExpiryWatcher } from "./offer-expiry-watcher";
export type { OfferExpiryWatcherProps } from "./offer-expiry-watcher";
export { OfferList } from "./offer-list";
export type { OfferListProps } from "./offer-list";
export { Filters } from "./filters";
export type { FiltersProps } from "./filters";
export { SearchCommand } from "./search-command";
export type { SearchCommandProps } from "./search-command";
export { ShareButton } from "./share-button";
export type { ShareButtonProps } from "./share-button";
export { RelativeTime } from "./relative-time";
export type { RelativeTimeProps } from "./relative-time";
export { PremiumSpotlight } from "./premium-spotlight";
export type { PremiumSpotlightProps } from "./premium-spotlight";
export { ConnectionIndicator } from "./connection-indicator";
export type { ConnectionIndicatorProps } from "./connection-indicator";
export { NewOffersNotice } from "./new-offers-notice";
export type { NewOffersNoticeProps } from "./new-offers-notice";
export { LiveOfferItem } from "./live-offer-item";
export type { LiveOfferItemProps } from "./live-offer-item";
export { useOffersRealtime } from "./use-offers-realtime";
export type { UseOffersRealtimeResult } from "./use-offers-realtime";
