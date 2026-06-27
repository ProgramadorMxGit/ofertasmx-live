import { serializeJsonLd, type JsonLdNode } from "@/lib/seo/jsonld";

/**
 * `<JsonLd>` — inject one or more JSON-LD documents (Task 30.2 / R20.3).
 *
 * A tiny Server Component that renders a single
 * `<script type="application/ld+json">` with the pre-serialized, `<`-escaped
 * structured data produced by the pure builders in `lib/seo/jsonld`. Google
 * reads JSON-LD anywhere in the document, so this can sit inside the page body.
 * The content is our own first-party data (not user input from the network), and
 * the serializer escapes `<` so embedded offer text can never break out of the
 * script element.
 */
interface JsonLdProps {
  readonly data: JsonLdNode | readonly JsonLdNode[];
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
