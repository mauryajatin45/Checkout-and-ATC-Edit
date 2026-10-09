import prisma from "../db.server";

export interface UpsellItemInput {
  id?: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  customTitle?: string | null;
  customDescription?: string | null;
  strikethroughPrice?: string | null;
  price?: string | null;
  imageUrl?: string | null;
  position?: number;
}

export interface UpsellCampaignInput {
  name: string;
  enabled?: boolean;
  sourcePage: string;
  headline?: string | null;
  description?: string | null;
  priority?: number;
  items: UpsellItemInput[];
}

export async function getUpsellCampaigns(shopDomain: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
    include: {
      upsellCampaigns: {
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  return store?.upsellCampaigns || [];
}

export async function getUpsellCampaign(shopDomain: string, id: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) return null;

  return prisma.checkoutUpsellCampaign.findFirst({
    where: {
      id,
      storeId: store.id,
    },
    include: {
      items: {
        orderBy: { position: "asc" },
      },
    },
  });
}

export async function createUpsellCampaign(shopDomain: string, data: UpsellCampaignInput) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) throw new Error("Store not found");

  return prisma.checkoutUpsellCampaign.create({
    data: {
      storeId: store.id,
      name: data.name,
      enabled: data.enabled ?? true,
      sourcePage: data.sourcePage.trim(),
      headline: data.headline || "Lost, stolen or damaged? We reship it free, no questions.",
      description: data.description || null,
      priority: data.priority || 0,
      items: {
        create: data.items.map((item, index) => ({
          shopifyProductId: item.shopifyProductId,
          shopifyVariantId: item.shopifyVariantId,
          customTitle: item.customTitle || null,
          customDescription: item.customDescription || null,
          strikethroughPrice: item.strikethroughPrice || null,
          price: item.price || null,
          imageUrl: item.imageUrl || null,
          position: item.position ?? index,
        })),
      },
    },
    include: {
      items: true,
    },
  });
}

export async function updateUpsellCampaign(shopDomain: string, id: string, data: UpsellCampaignInput) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) throw new Error("Store not found");

  // Verify ownership
  const existing = await prisma.checkoutUpsellCampaign.findFirst({
    where: { id, storeId: store.id },
  });

  if (!existing) throw new Error("Campaign not found");

  // Transaction to update campaign and rewrite items
  return prisma.$transaction(async (tx) => {
    // Delete old items
    await tx.checkoutUpsellItem.deleteMany({
      where: { campaignId: id },
    });

    // Update campaign and insert new items
    return tx.checkoutUpsellCampaign.update({
      where: { id },
      data: {
        name: data.name,
        enabled: data.enabled ?? existing.enabled,
        sourcePage: data.sourcePage.trim(),
        headline: data.headline ?? existing.headline,
        description: data.description ?? existing.description,
        priority: data.priority ?? existing.priority,
        items: {
          create: data.items.map((item, index) => ({
            shopifyProductId: item.shopifyProductId,
            shopifyVariantId: item.shopifyVariantId,
            customTitle: item.customTitle || null,
            customDescription: item.customDescription || null,
            strikethroughPrice: item.strikethroughPrice || null,
            price: item.price || null,
            imageUrl: item.imageUrl || null,
            position: item.position ?? index,
          })),
        },
      },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
      },
    });
  });
}

export async function deleteUpsellCampaign(shopDomain: string, id: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) throw new Error("Store not found");

  return prisma.checkoutUpsellCampaign.deleteMany({
    where: {
      id,
      storeId: store.id,
    },
  });
}

export async function toggleUpsellCampaign(shopDomain: string, id: string, enabled: boolean) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });

  if (!store) throw new Error("Store not found");

  return prisma.checkoutUpsellCampaign.updateMany({
    where: {
      id,
      storeId: store.id,
    },
    data: { enabled },
  });
}

export async function getMatchingUpsell(
  shopDomain: string,
  sourceParam?: string | null,
  cartProductIds?: string[] | null
) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
    include: {
      upsellCampaigns: {
        where: { enabled: true },
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!store || !store.upsellCampaigns || store.upsellCampaigns.length === 0) {
    return null;
  }

  const cleanSource = (sourceParam || "").trim().toLowerCase();

  // 1. Try exact or partial match with the clean source parameter
  if (cleanSource) {
    for (const campaign of store.upsellCampaigns) {
      const campSource = campaign.sourcePage.trim().toLowerCase();
      // Ignore universal wildcard in specific matching
      if (campSource === "*" || campSource === "all") continue;

      if (
        campSource === cleanSource ||
        cleanSource.includes(campSource) ||
        campSource.includes(cleanSource)
      ) {
        return campaign;
      }
    }
  }

  // 2. Try matching against products in the cart (e.g. /products/handle or product id)
  if (cartProductIds && cartProductIds.length > 0) {
    for (const campaign of store.upsellCampaigns) {
      const campSource = campaign.sourcePage.trim().toLowerCase();
      if (campSource === "*" || campSource === "all") continue;

      for (const prodId of cartProductIds) {
        const cleanProdId = prodId.toLowerCase();
        if (
          campSource.includes(cleanProdId) ||
          cleanProdId.includes(campSource)
        ) {
          return campaign;
        }
      }
    }
  }

  // 3. Fallback to universal wildcard campaign (* or all)
  const universal = store.upsellCampaigns.find(
    (c) => c.sourcePage.trim() === "*" || c.sourcePage.trim().toLowerCase() === "all"
  );
  if (universal) return universal;

  return null;
}

