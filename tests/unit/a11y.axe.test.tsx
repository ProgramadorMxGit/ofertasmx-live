// @vitest-environment jsdom
/**
 * Automated accessibility checks (Task 37.2 / R25.1, R25.3).
 *
 * Pragmatic approach: the app's pages are server-rendered and pull in the Next
 * runtime, so instead of booting a browser here we render the **key
 * presentational components** with `@testing-library/react` into jsdom and run
 * `axe-core` against each, asserting **zero WCAG A/AA violations**. This covers
 * names/labels/roles/aria relationships and structural rules. Color-contrast is
 * a layout-dependent rule that axe reports as "incomplete" under jsdom (there is
 * no real rendering engine), so true contrast verification is delegated to the
 * Playwright + `@axe-core/playwright` pass against the running pages (Task 38);
 * it is intentionally not asserted here.
 *
 * Only WCAG tags are enabled (`wcag2a … wcag22aa`) so best-practice-only rules
 * that assume a full document (`region`, `landmark-one-main`, `page-has-heading-
 * one`, `heading-order`) do not flag isolated component fragments.
 */
import axe from "axe-core";
import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// publicEnv validates `process.env` at import time, so seed safe placeholders
// before any component module (which transitively imports it) is loaded.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL ||= "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://supabase.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key-not-a-secret";
  process.env.NEXT_PUBLIC_WHATSAPP_INVITE_URL ||= "https://wa.me/520000000000";
});

// --- Lightweight mocks for Next.js primitives that need the framework runtime.

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: React.ReactNode;
  }) => React.createElement("a", { href, ...rest }, children),
}));

vi.mock("next/image", () => ({
  // Render a plain <img>; next/image-only props (fill/priority/sizes…) are
  // simply not forwarded, so React does not warn about unknown attributes.
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => React.createElement("img", { src, alt, className }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/ofertas",
  useSearchParams: () => new URLSearchParams(""),
}));

// OfferExpiryWatcher (inside OfferDetail) opens a browser Supabase client; stub
// it so it never touches the network and reports the offer as still active.
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "active" }, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import { Footer } from "@/components/layout/footer";
import { TrustBar } from "@/components/layout/trust-bar";
import { Filters } from "@/components/offers/filters";
import { OfferCard } from "@/components/offers/offer-card";
import { OfferDetail } from "@/components/offers/offer-detail";
import {
  EmptyState,
  ExpiredOfferState,
  IncompleteDataState,
  MaintenanceState,
  NetworkErrorState,
  NoFeaturedState,
  NoResultsState,
  RealtimeDisconnectedState,
  RetryingState,
} from "@/components/ui/states";
import { makePublicOffer } from "../fixtures/offers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Run axe over a rendered fragment and fail with a readable report on any WCAG violation. */
async function expectNoViolations(container: HTMLElement): Promise<void> {
  const results: axe.AxeResults = await axe.run(container, {
    runOnly: { type: "tag", values: WCAG_TAGS },
    // color-contrast needs a real layout/canvas, which jsdom lacks (it would be
    // reported "incomplete", never a violation). Contrast is verified in the
    // Playwright + @axe-core/playwright pass (Task 38) against the live pages.
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });

  if (results.violations.length > 0) {
    const report = results.violations
      .map((violation: axe.Result) => {
        const targets = violation.nodes
          .map((node) => `    → ${node.target.join(" ")}`)
          .join("\n");
        return `  [${violation.id}] (${violation.impact ?? "n/a"}) ${violation.help}\n${targets}`;
      })
      .join("\n");
    throw new Error(`axe found ${results.violations.length} WCAG violation(s):\n${report}`);
  }

  expect(results.violations).toHaveLength(0);
}

beforeAll(() => {
  // jsdom has no matchMedia; the gated premium spotlight reads it on mount.
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    });
  }
});

afterEach(() => {
  cleanup();
});

describe("accessibility (axe) — presentational components", () => {
  describe("OfferCard", () => {
    it("active offer with discount + savings has no violations", async () => {
      const { container } = render(
        <OfferCard
          offer={makePublicOffer({ id: "00000000-0000-4000-8000-00000000c001" })}
          showAmazonPrices
        />,
      );
      await expectNoViolations(container);
    });

    it("expired offer has no violations", async () => {
      const { container } = render(
        <OfferCard
          offer={makePublicOffer({
            id: "00000000-0000-4000-8000-00000000c002",
            status: "expired",
            expires_at: "2024-05-01T00:00:00.000Z",
          })}
          showAmazonPrices
        />,
      );
      await expectNoViolations(container);
    });

    it("Amazon offer with hidden price has no violations", async () => {
      const { container } = render(
        <OfferCard
          offer={makePublicOffer({
            id: "00000000-0000-4000-8000-00000000c003",
            platform: "amazon",
          })}
          showAmazonPrices={false}
        />,
      );
      await expectNoViolations(container);
    });

    it("offer without an image (fallback) has no violations", async () => {
      const { container } = render(
        <OfferCard
          offer={makePublicOffer({
            id: "00000000-0000-4000-8000-00000000c004",
            image_status: "failed",
            image_url: null,
          })}
          showAmazonPrices
        />,
      );
      await expectNoViolations(container);
    });
  });

  describe("UI state blocks", () => {
    it("renders every shared state with no violations", async () => {
      const { container } = render(
        <main>
          <EmptyState />
          <NoResultsState />
          <NetworkErrorState />
          <RealtimeDisconnectedState />
          <RetryingState />
          <ExpiredOfferState />
          <IncompleteDataState />
          <NoFeaturedState />
          <MaintenanceState />
        </main>,
      );
      await expectNoViolations(container);
    });
  });

  describe("layout chrome", () => {
    it("TrustBar has no violations", async () => {
      const { container } = render(<TrustBar />);
      await expectNoViolations(container);
    });

    it("Footer has no violations", async () => {
      const { container } = render(<Footer />);
      await expectNoViolations(container);
    });
  });

  describe("forms", () => {
    it("Filters controls have associated labels and no violations", async () => {
      const { container } = render(<Filters />);
      await expectNoViolations(container);
    });
  });

  describe("offer detail (breadcrumb + headings)", () => {
    it("has no violations", async () => {
      const { container } = render(
        <OfferDetail
          offer={makePublicOffer({ id: "00000000-0000-4000-8000-00000000d001" })}
          related={[]}
          showAmazonPrices
        />,
      );
      await expectNoViolations(container);
    });
  });
});
