/** Shared by the Trust Badges admin page (browser) and server code. No server-only imports here. */

export interface TrustItem {
  icon: string;
  title: string;
  description: string;
}

export const MAX_TRUST_ITEMS = 6;

/** What Zoyava's Checkout Blocks block showed on Nov 9, 2026; offered as the starting content. */
export const DEFAULT_TRUST_ITEMS: TrustItem[] = [
  {
    "icon": "<svg width=\"40\" height=\"40\" viewBox=\"0 0 40 40\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M11 5.5H29C32.314 5.5 35 8.186 35 11.5V24C35 27.314 32.314 30 29 30H21.2L16.1 34.5V30H11C7.686 30 5 27.314 5 24V11.5C5 8.186 7.686 5.5 11 5.5Z\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M20 10.5L22.15 14.75L26.85 15.43L23.45 18.75L24.25 23.43L20 21.22L15.75 23.43L16.55 18.75L13.15 15.43L17.85 14.75L20 10.5Z\" stroke=\"currentColor\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
    "title": "4.9 stars from 100,000+ reviews",
    "description": "1 Million+ Members and more than 2 Billion Gummies sold!"
  },
  {
    "icon": "<svg width=\"40\" height=\"40\" viewBox=\"0 0 40 40\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M20 3.8L24.1 6.2L28.8 6.1L31.1 10.2L35.2 12.5L34.9 17.2L36.5 21.5L33.6 25.2L32.7 29.8L28.2 31.2L24.8 34.3L20 33L15.2 34.3L11.8 31.2L7.3 29.8L6.4 25.2L3.5 21.5L5.1 17.2L4.8 12.5L8.9 10.2L11.2 6.1L15.9 6.2L20 3.8Z\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linejoin=\"round\"/><path d=\"M12.8 19.5L17.2 23.7L27.5 13.7\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
    "title": "Clinically and 3rd Party Tested",
    "description": "Every lot of our products undergoes rigorous testing to ensure quality and purity."
  },
  {
    "icon": "<svg width=\"40\" height=\"40\" viewBox=\"0 0 40 40\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect x=\"5\" y=\"7.5\" width=\"25\" height=\"25\" rx=\"3\" stroke=\"currentColor\" stroke-width=\"2.2\"/><path d=\"M5 14.5H30\" stroke=\"currentColor\" stroke-width=\"2.2\"/><path d=\"M11 4.5V10\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><path d=\"M24 4.5V10\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><circle cx=\"29\" cy=\"28\" r=\"7\" fill=\"white\" stroke=\"currentColor\" stroke-width=\"2.2\"/><path d=\"M29 24.5V28L31.5 29.5\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
    "title": "Swap or Cancel Anytime",
    "description": "Zero Commitments. Zero Worries. Modify your subscription at any time."
  }
];

export function cleanTrustItems(raw: unknown): TrustItem[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((it: any) => ({
      icon: String(it?.icon || "").trim().slice(0, 8000),
      title: String(it?.title || "").trim().slice(0, 190),
      description: String(it?.description || "").trim().slice(0, 500),
    }))
    .filter((it) => it.title || it.description)
    .slice(0, MAX_TRUST_ITEMS);
}

export function parseTrustItems(raw: string | null | undefined): TrustItem[] {
  try {
    return cleanTrustItems(JSON.parse(raw || "[]"));
  } catch {
    return [];
  }
}

/** Icon as an image source the checkout can load: SVG code becomes a data URI, URLs pass through. */
export function iconSource(icon: string): string {
  const t = (icon || "").trim();
  if (!t) return "";
  if (t.startsWith("<svg") || t.startsWith("<?xml")) {
    return "data:image/svg+xml," + encodeURIComponent(t.replace(/\s+/g, " "));
  }
  return /^(https:|data:image\/)/.test(t) ? t : "";
}
