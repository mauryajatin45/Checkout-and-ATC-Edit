import prisma from "../db.server";
import { ensureStore, numericId, clean, clampInt, clampPercent } from "./postPurchase.server";

/*
 * Thank-you page offers: a block on Shopify's Thank you page. The order is already complete there, so nothing
 * can be added to it. "Buy now" opens a NEW checkout (cart permalink) prefilled with the offer, the buyer's
 * email/address and an optional discount code. We track views and clicks per order and item.
 */

export { MAX_TY_ITEMS, TY_DEFAULT_COPY, parseJsonArray } from "../lib/thankYou.shared";
export type { ThankYouItemInput, ThankYouCampaignInput } from "../lib/thankYou.shared";
import { MAX_TY_ITEMS, parseJsonArray } from "../lib/thankYou.shared";
import type { ThankYouCampaignInput, ThankYouItemInput, TriggerProduct, TriggerType } from "../lib/thankYou.shared";

function itemData(it: ThankYouItemInput, position: number) {
  return {
    position,
    productId: it.productId,
    variantId: it.variantId,
    productTitle: clean(it.productTitle, 190) || "Product",
    variantTitle: clean(it.variantTitle, 190),
    imageUrl: clean(it.imageUrl, 2000),
    variantPrice: clean(it.variantPrice, 40),
    compareAtPrice: clean(it.compareAtPrice, 40),
    maxQuantity: clampInt(it.maxQuantity, 1, 10, 3),
    skipIfInOrder: it.skipIfInOrder ?? false,
    showShippingNote: it.showShippingNote ?? false,
  };
}

function campaignData(d: ThankYouCampaignInput) {
  const code = clean(d.discountCode, 120);
  return {
    name: clean(d.name, 190) || "Thank-you offer",
    enabled: d.enabled ?? false,
    priority: clampInt(d.priority, -100, 100, 0),
    triggerType: d.triggerType === "products" ? "products" : "all",
    triggerProducts: JSON.stringify(
      (d.triggerProducts || []).filter((p) => p && p.id).map((p) => ({ id: p.id, title: String(p.title || "") })),
    ),
    timerMinutes: clampInt(d.timerMinutes, 0, 60, 10),
    badgeText: clean(d.badgeText, 190),
    headline: clean(d.headline, 190),
    subheadline: clean(d.subheadline, 1000),
    buttonLabel: clean(d.buttonLabel, 190),
    smallPrint: clean(d.smallPrint, 1000),
    // Codes can't contain spaces; Shopify matches them case-insensitively.
    discountCode: code ? code.replace(/\s+/g, "") : null,
    discountPercent: code ? clampPercent(d.discountPercent) : 0,
  };
}

export function validateCampaign(d: ThankYouCampaignInput): string | null {
  if (!d.items || d.items.length === 0) return "Add at least one product.";
  if (d.items.length > MAX_TY_ITEMS) return `An offer can show at most ${MAX_TY_ITEMS} products.`;
  for (const [i, it] of d.items.entries()) {
    if (!it.productId || !it.variantId) return `Product ${i + 1}: pick a product.`;
  }
  if (d.triggerType === "products" && (!d.triggerProducts || d.triggerProducts.length === 0)) {
    return "Pick at least one trigger product, or show the offer on all orders.";
  }
  if (Number(d.discountPercent) > 0 && !clean(d.discountCode)) {
    return "Enter the discount code that gives this % off (create it in Shopify → Discounts), or set the % to 0.";
  }
  return null;
}

async function storeFor(shopDomain: string) {
  return prisma.store.findUnique({ where: { shopDomain } });
}

// ─── admin CRUD ─────────────────────────────────────────────────────────────

export async function listCampaigns(shopDomain: string) {
  const store = await storeFor(shopDomain);
  if (!store) return [];
  return prisma.thankYouCampaign.findMany({
    where: { storeId: store.id },
    include: { items: { orderBy: { position: "asc" } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function getCampaign(shopDomain: string, id: string) {
  const store = await storeFor(shopDomain);
  if (!store) return null;
  return prisma.thankYouCampaign.findFirst({
    where: { id, storeId: store.id },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

export async function createCampaign(shopDomain: string, d: ThankYouCampaignInput) {
  const store = await ensureStore(shopDomain);
  return prisma.thankYouCampaign.create({
    data: {
      storeId: store.id,
      ...campaignData(d),
      items: { create: d.items.slice(0, MAX_TY_ITEMS).map((it, i) => itemData(it, i)) },
    },
  });
}

export async function updateCampaign(shopDomain: string, id: string, d: ThankYouCampaignInput) {
  const store = await storeFor(shopDomain);
  if (!store) throw new Error("Store not found");
  const existing = await prisma.thankYouCampaign.findFirst({ where: { id, storeId: store.id }, include: { items: true } });
  if (!existing) throw new Error("Offer not found");
  const items = d.items.slice(0, MAX_TY_ITEMS);
  // Items are updated in place by position so their stats stay attached.
  return prisma.$transaction(async (tx) => {
    await tx.thankYouCampaign.update({ where: { id }, data: campaignData(d) });
    const byPos = new Map(existing.items.map((it) => [it.position, it]));
    for (const [i, it] of items.entries()) {
      const prev = byPos.get(i);
      if (prev) await tx.thankYouItem.update({ where: { id: prev.id }, data: itemData(it, i) });
      else await tx.thankYouItem.create({ data: { campaignId: id, ...itemData(it, i) } });
    }
    const removed = existing.items.filter((it) => it.position >= items.length).map((it) => it.id);
    if (removed.length) await tx.thankYouItem.deleteMany({ where: { id: { in: removed } } });
  });
}

export async function setCampaignEnabled(shopDomain: string, id: string, enabled: boolean) {
  const store = await storeFor(shopDomain);
  if (!store) throw new Error("Store not found");
  return prisma.thankYouCampaign.updateMany({ where: { id, storeId: store.id }, data: { enabled } });
}

export async function deleteCampaign(shopDomain: string, id: string) {
  const store = await storeFor(shopDomain);
  if (!store) throw new Error("Store not found");
  return prisma.thankYouCampaign.deleteMany({ where: { id, storeId: store.id } });
}

export async function duplicateCampaign(shopDomain: string, id: string) {
  const c = await getCampaign(shopDomain, id);
  if (!c) throw new Error("Offer not found");
  return createCampaign(shopDomain, {
    ...c,
    name: `${c.name} (copy)`,
    enabled: false,
    triggerType: c.triggerType as TriggerType,
    triggerProducts: parseJsonArray<TriggerProduct>(c.triggerProducts),
    items: c.items,
  });
}

// ─── stats ──────────────────────────────────────────────────────────────────

export interface TyStats {
  views: number;
  clicks: number;
  ctr: number; // clicks / views, %
}

export async function campaignStats(shopDomain: string, days = 30) {
  const store = await storeFor(shopDomain);
  const byCampaign: Record<string, TyStats> = {};
  const byItem: Record<string, TyStats> = {};
  if (!store) return { byCampaign, byItem };
  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.thankYouEvent.groupBy({
    by: ["campaignId", "itemId", "type"],
    where: { storeId: store.id, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const blank = (): TyStats => ({ views: 0, clicks: 0, ctr: 0 });
  for (const r of rows) {
    // A view is logged once per order for the whole block (itemId null); clicks are per item.
    const c = (byCampaign[r.campaignId] ||= blank());
    if (r.type === "view" && !r.itemId) c.views += r._count._all;
    if (r.type === "click") c.clicks += r._count._all;
    if (r.itemId) {
      const s = (byItem[r.itemId] ||= blank());
      if (r.type === "click") s.clicks += r._count._all;
    }
  }
  for (const c of Object.values(byCampaign)) c.ctr = c.views ? Math.round((c.clicks / c.views) * 1000) / 10 : 0;
  return { byCampaign, byItem };
}

// ─── storefront (extension) side ────────────────────────────────────────────

export async function matchCampaign(shopDomain: string, productIds: Array<string | number>) {
  const store = await storeFor(shopDomain);
  if (!store) return null;
  const campaigns = await prisma.thankYouCampaign.findMany({
    where: { storeId: store.id, enabled: true },
    include: { items: { orderBy: { position: "asc" } } },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
  const inOrder = new Set(productIds.map((p) => numericId(p)));
  for (const c of campaigns) {
    if (!c.items.length) continue;
    if (c.triggerType === "all") return c;
    const triggers = parseJsonArray<TriggerProduct>(c.triggerProducts).map((p) => numericId(p.id));
    if (triggers.some((t) => inOrder.has(t))) return c;
  }
  return null;
}

export function publicCampaign(c: NonNullable<Awaited<ReturnType<typeof matchCampaign>>>) {
  return {
    id: c.id,
    timerMinutes: c.timerMinutes,
    badgeText: c.badgeText,
    headline: c.headline,
    subheadline: c.subheadline,
    buttonLabel: c.buttonLabel,
    smallPrint: c.smallPrint,
    discountCode: c.discountCode,
    discountPercent: c.discountPercent,
    items: c.items.map((it) => ({
      id: it.id,
      productId: numericId(it.productId),
      variantId: numericId(it.variantId),
      productTitle: it.productTitle,
      imageUrl: it.imageUrl,
      price: it.variantPrice,
      compareAtPrice: it.compareAtPrice,
      maxQuantity: it.maxQuantity,
      skipIfInOrder: it.skipIfInOrder,
      showShippingNote: it.showShippingNote,
    })),
  };
}

export async function recordTyEvent(
  shopDomain: string,
  e: { campaignId: string; itemId?: string | null; type: string; referenceId?: string | null; quantity?: number | null },
) {
  if (!["view", "click"].includes(e.type)) return null;
  const store = await storeFor(shopDomain);
  if (!store) return null;
  const campaign = await prisma.thankYouCampaign.findFirst({ where: { id: e.campaignId, storeId: store.id }, select: { id: true } });
  if (!campaign) return null;
  let itemId = e.itemId || null;
  if (itemId) {
    const owned = await prisma.thankYouItem.findFirst({ where: { id: itemId, campaignId: campaign.id }, select: { id: true } });
    if (!owned) itemId = null;
  }
  if (e.type === "view") itemId = null;
  // One view per order; one click per order and item (the thank-you page is often reloaded).
  if (e.referenceId) {
    const dup = await prisma.thankYouEvent.findFirst({
      where: { campaignId: campaign.id, itemId, type: e.type, referenceId: e.referenceId },
      select: { id: true },
    });
    if (dup) return dup;
  }
  return prisma.thankYouEvent.create({
    data: {
      storeId: store.id,
      campaignId: campaign.id,
      itemId,
      type: e.type,
      referenceId: clean(e.referenceId, 190),
      quantity: e.quantity ? clampInt(e.quantity, 0, 1000, 0) : null,
    },
  });
}
