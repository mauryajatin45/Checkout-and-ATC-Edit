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
  buttonColor?: string | null;
  buttonTextColor?: string | null;
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
      headline: data.headline ? data.headline.trim() : null,
      description: data.description || null,
      buttonColor: data.buttonColor || "#0066cc",
      buttonTextColor: data.buttonTextColor || "#ffffff",
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
        headline: data.headline !== undefined ? (data.headline ? data.headline.trim() : null) : existing.headline,
        description: data.description ?? existing.description,
        buttonColor: data.buttonColor ?? existing.buttonColor ?? "#0066cc",
        buttonTextColor: data.buttonTextColor ?? existing.buttonTextColor ?? "#ffffff",
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
  cartProductIds?: string[] | null,
  isEditor?: boolean
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

  // In Checkout Editor / Preview mode, always return the top active campaign
  if (isEditor && store.upsellCampaigns.length > 0) {
    return store.upsellCampaigns[0];
  }

  function normalizePath(raw: string): string {
    if (!raw) return "";
    let clean = raw.trim().toLowerCase();
    try {
      if (clean.startsWith("http://") || clean.startsWith("https://")) {
        clean = new URL(clean).pathname;
      }
    } catch (e) {}
    clean = clean.replace(/^(?:https?:\/\/)?(?:www\.)?[^\/]+/, "");
    clean = clean.replace(/^(?:www\.)?[a-z0-9-]+\.[a-z0-9.]+(?:\/|$)/, "/");
    clean = clean.split("?")[0].split("#")[0].replace(/\/+$/, "");
    if (clean && !clean.startsWith("/")) clean = "/" + clean;
    return clean || "/";
  }

  function isPathMatch(campSourceRaw: string, buyerSourceRaw: string): boolean {
    if (!campSourceRaw || !buyerSourceRaw) return false;
    const campTrim = campSourceRaw.trim().toLowerCase();
    const buyerTrim = buyerSourceRaw.trim().toLowerCase();

    // Universal wildcard match
    if (campTrim === "*" || campTrim === "all") return true;

    const normCamp = normalizePath(campTrim);
    const normBuyer = normalizePath(buyerTrim);

    // Exact normalized path match (e.g. "/pages/kids-deficiency-signs" === "/pages/kids-deficiency-signs")
    if (normCamp && normBuyer && normCamp === normBuyer) {
      return true;
    }

    // Wildcard prefix match (e.g. "/pages/promo*" matches "/pages/promo" and "/pages/promo-kids")
    if (campTrim.endsWith("*")) {
      const prefix = normalizePath(campTrim.replace(/\*+$/, ""));
      if (prefix && prefix !== "/" && (normBuyer === prefix || normBuyer.startsWith(prefix + "/"))) {
        return true;
      }
    }

    // Slug match if merchant entered just the handle: e.g. "kids-deficiency-signs"
    const campSlug = normCamp.split("/").filter(Boolean).pop() || "";
    if (campSlug && campSlug.length > 3 && normBuyer.endsWith("/" + campSlug)) {
      return true;
    }

    // Exact raw string match
    if (campTrim === buyerTrim) {
      return true;
    }

    return false;
  }

  const cleanSource = (sourceParam || "").trim().toLowerCase();

  // 1. Strict match against buyer tracked source page
  if (cleanSource) {
    for (const campaign of store.upsellCampaigns) {
      const campSource = campaign.sourcePage.trim().toLowerCase();
      // Skip universal campaigns in specific match pass
      if (campSource === "*" || campSource === "all") continue;

      if (isPathMatch(campSource, cleanSource)) {
        return campaign;
      }
    }
  }

  // 2. Try matching against products in the cart if campaign targets a specific product
  if (cartProductIds && cartProductIds.length > 0) {
    for (const campaign of store.upsellCampaigns) {
      const campSource = campaign.sourcePage.trim().toLowerCase();
      if (campSource === "*" || campSource === "all") continue;

      const normCamp = normalizePath(campSource);
      for (const prodId of cartProductIds) {
        const cleanProdId = prodId.toLowerCase();
        if (
          normCamp === `/${cleanProdId}` ||
          normCamp === `/products/${cleanProdId}` ||
          campSource === cleanProdId
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
