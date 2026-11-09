import prisma from "../db.server";
import { ensureStore } from "./postPurchase.server";

/*
 * Trust badges in checkout: a short list of icon + title + line (reviews, testing, cancel anytime).
 * Replaces the Checkout Blocks "Checkout Trust & Guarantee" block. Icons are SVG code or an image URL.
 */

export { DEFAULT_TRUST_ITEMS, MAX_TRUST_ITEMS, cleanTrustItems, parseTrustItems, iconSource } from "../lib/trustBlock.shared";
export type { TrustItem } from "../lib/trustBlock.shared";
import { cleanTrustItems, type TrustItem } from "../lib/trustBlock.shared";

export async function getTrustBlock(shopDomain: string) {
  const store = await prisma.store.findUnique({ where: { shopDomain }, include: { trustBlock: true } });
  return store?.trustBlock || null;
}

export async function saveTrustBlock(shopDomain: string, data: { enabled: boolean; title?: string | null; items: TrustItem[] }) {
  const store = await ensureStore(shopDomain);
  const row = {
    enabled: !!data.enabled,
    title: data.title ? String(data.title).trim().slice(0, 190) || null : null,
    items: JSON.stringify(cleanTrustItems(data.items)),
  };
  return prisma.checkoutTrustBlock.upsert({
    where: { storeId: store.id },
    update: row,
    create: { storeId: store.id, ...row },
  });
}
