/** Shared by the post-purchase admin pages (browser) and server models. No server-only imports here. */

export const MAX_STEPS = 3;

export type ShowWhen = "always" | "accepted" | "declined";
export type TriggerType = "all" | "products";
/** Who a funnel is for: any order, orders with a subscription line, or orders without one. */
export type BuyerType = "any" | "subscriber" | "onetime";

export interface TriggerProduct {
  id: string; // gid://shopify/Product/123
  title: string;
}

/** "product": add to this order now. "next_box": $0 today, added to the customer's subscription (Recharge). */
export type OfferType = "product" | "next_box";

export interface OfferInput {
  offerType?: OfferType;
  subFirstPrice?: string | null;
  subRecurringPrice?: string | null;
  subIntervalDays?: number;
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
  buyerType?: BuyerType;
  /** The order must contain one of these variants (empty = no requirement). Same { id, title } shape. */
  includeVariants?: TriggerProduct[];
  /** The order must contain none of these variants. */
  excludeVariants?: TriggerProduct[];
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

