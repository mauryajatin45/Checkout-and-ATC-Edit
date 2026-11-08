/** Shared by the post-purchase admin pages (browser) and server models. No server-only imports here. */

export const MAX_STEPS = 3;

export type ShowWhen = "always" | "accepted" | "declined";
export type TriggerType = "all" | "products";

export interface TriggerProduct {
  id: string; // gid://shopify/Product/123
  title: string;
}

export interface OfferInput {
  showWhen?: ShowWhen;
  skipIfInOrder?: boolean;
  showShippingNote?: boolean;
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle?: string | null;
  imageUrl?: string | null;
  variantPrice?: string | null;
  compareAtPrice?: string | null;
  discountPercent?: number;
  discountTitle?: string | null;
  maxQuantity?: number;
  badgeText?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  bullets?: string[];
  ratingText?: string | null;
  guaranteeText?: string | null;
  acceptLabel?: string | null;
  declineLabel?: string | null;
}

export interface FunnelInput {
  name: string;
  enabled?: boolean;
  priority?: number;
  triggerType?: TriggerType;
  triggerProducts?: TriggerProduct[];
  timerMinutes?: number;
  steps: OfferInput[];
}

export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

