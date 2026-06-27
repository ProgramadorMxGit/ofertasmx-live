import { ImageResponse } from "next/og";

import { serverEnv } from "@/lib/env.server";
import {
  HIDDEN_AMAZON_PRICE_CTA,
  priceDisplay,
} from "@/lib/offers/price-visibility";
import type { OfferPlatform } from "@/lib/offers/query";
import { fetchOfferBySlug } from "@/lib/offers/server-fetch";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { formatMXN } from "@/lib/utils/money";

/**
 * Dynamic Open Graph image per offer (Task 30.4 / R20.7).
 *
 * Renders a premium 1200×630 social card with `next/og` `ImageResponse`: the
 * offer title, the current price (or the honest "consulta el precio en Amazon"
 * CTA when the Amazon price is hidden, R22.2), the discount, a discreet brand
 * mark and a dark premium background — legible in WhatsApp/Facebook previews.
 * The offer is fetched by slug server-side; when it is absent (or the DB is
 * unreachable) a branded fallback card is rendered. Dependency-light: system
 * fonts only.
 *
 * Node runtime is required because the fetch path uses the server Supabase
 * client (cookies). Next wires this file into the page's Open Graph + Twitter
 * image metadata automatically.
 */
export const runtime = "nodejs";
export const alt = `${SITE_NAME} — oferta real`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PLATFORM_LABEL: Record<OfferPlatform, string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

// Palette — sRGB equivalents of the dark-first design tokens.
const COLOR = {
  fg: "#e9eef6",
  muted: "#9aa6b8",
  primary: "#18adf2",
  ink: "#06121b",
  panel: "#141a26",
  border: "#222a38",
} as const;

const BACKGROUND =
  "linear-gradient(135deg, #0b101b 0%, #0e1016 55%, #0a2533 100%)";

/** Trim the title so it never overruns the card. */
function clampTitle(title: string, max = 84): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Discreet brand mark + wordmark. */
function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          width: 44,
          height: 44,
          borderRadius: 9999,
          background: COLOR.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{ width: 15, height: 15, borderRadius: 9999, background: COLOR.ink }}
        />
      </div>
      <div style={{ display: "flex", marginLeft: 16, fontSize: 30, fontWeight: 700 }}>
        <span style={{ color: COLOR.fg }}>Ofertas Reales</span>
        <span style={{ color: COLOR.primary, marginLeft: 10 }}>IA</span>
      </div>
    </div>
  );
}

interface OpengraphImageProps {
  params: Promise<{ slug: string }>;
}

export default async function OpengraphImage({ params }: OpengraphImageProps) {
  const { slug } = await params;
  const offer = await fetchOfferBySlug(slug);

  const platformLabel = offer ? PLATFORM_LABEL[offer.platform] : null;
  const price = offer ? priceDisplay(offer, serverEnv.SHOW_AMAZON_PRICES) : null;
  const imageUrl =
    offer &&
    offer.image_status === "ready" &&
    offer.image_url &&
    /^https?:\/\//i.test(offer.image_url)
      ? offer.image_url
      : null;
  const discount = offer?.discount_percent ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 64,
          backgroundImage: BACKGROUND,
          color: COLOR.fg,
          fontFamily: "sans-serif",
        }}
      >
        <Brand />

        {offer ? (
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                paddingRight: imageUrl ? 48 : 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  alignItems: "center",
                  borderRadius: 9999,
                  border: `1px solid ${COLOR.border}`,
                  background: "rgba(255,255,255,0.06)",
                  padding: "6px 16px",
                  fontSize: 24,
                  color: COLOR.muted,
                }}
              >
                {platformLabel}
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 22,
                  fontSize: 54,
                  fontWeight: 700,
                  lineHeight: 1.12,
                  letterSpacing: -1,
                  color: COLOR.fg,
                }}
              >
                {clampTitle(offer.title)}
              </div>

              {price?.kind === "hidden" ? (
                <div
                  style={{
                    display: "flex",
                    marginTop: 28,
                    fontSize: 44,
                    fontWeight: 700,
                    color: COLOR.primary,
                  }}
                >
                  {HIDDEN_AMAZON_PRICE_CTA}
                </div>
              ) : price?.kind === "visible" ? (
                <div
                  style={{
                    display: "flex",
                    marginTop: 28,
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{ fontSize: 88, fontWeight: 800, letterSpacing: -2 }}
                  >
                    {formatMXN(price.currentPrice)}
                  </span>
                  {price.originalPrice !== null &&
                  price.originalPrice > price.currentPrice ? (
                    <span
                      style={{
                        marginLeft: 20,
                        fontSize: 36,
                        color: COLOR.muted,
                        textDecoration: "line-through",
                      }}
                    >
                      {formatMXN(price.originalPrice)}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {discount !== null ? (
                <div
                  style={{
                    display: "flex",
                    marginTop: 18,
                    alignSelf: "flex-start",
                    borderRadius: 9999,
                    background: COLOR.primary,
                    color: COLOR.ink,
                    padding: "8px 20px",
                    fontSize: 30,
                    fontWeight: 800,
                  }}
                >
                  -{discount}% de descuento
                </div>
              ) : null}
            </div>

            {imageUrl ? (
              <div
                style={{
                  display: "flex",
                  width: 360,
                  height: 360,
                  borderRadius: 28,
                  background: COLOR.panel,
                  border: `1px solid ${COLOR.border}`,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  width={312}
                  height={312}
                  style={{ objectFit: "contain" }}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 64,
                fontWeight: 800,
                letterSpacing: -1.5,
                lineHeight: 1.1,
                color: COLOR.fg,
              }}
            >
              Ofertas reales en tiempo real
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 32,
                color: COLOR.muted,
              }}
            >
              Amazon México y Mercado Libre, sin precios inventados.
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: COLOR.muted,
          }}
        >
          <span>{SITE_URL.replace(/^https?:\/\//, "")}</span>
          <span>Enlace de afiliado · el precio puede cambiar</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
