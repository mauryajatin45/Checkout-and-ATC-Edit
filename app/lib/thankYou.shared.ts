/** Shared by the thank-you offer admin pages (browser) and server models. No server-only imports here. */

export type { TriggerType, TriggerProduct } from "./postPurchase.shared";
export { parseJsonArray } from "./postPurchase.shared";
import type { TriggerType, TriggerProduct } from "./postPurchase.shared";

export const MAX_TY_ITEMS = 3;

export interface ThankYouItemInput {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle?: string | null;
  imageUrl?: string | null;
  variantPrice?: string | null;
  compareAtPrice?: string | null;
  maxQuantity?: number;
  skipIfInOrder?: boolean;
  showShippingNote?: boolean;
}

export interface ThankYouCampaignInput {
  name: string;
  enabled?: boolean;
  priority?: number;
  triggerType?: TriggerType;
  triggerProducts?: TriggerProduct[];
  timerMinutes?: number;
  badgeText?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  buttonLabel?: string | null;
  smallPrint?: string | null;
  discountCode?: string | null;
  discountPercent?: number;
  items: ThankYouItemInput[];
}

export const TY_DEFAULT_COPY = {
  badgeText: "ONE-TIME OFFER",
  headline: "Your order is confirmed. Add {product} at {percent}% off",
  subheadline: "This price is only available here, for the next few minutes. It opens a quick new checkout with your details already filled in.",
  buttonLabel: "Buy now · {price}",
  smallPrint: "Ships separately from your current order. Your current order is already confirmed and won't change.",
};
