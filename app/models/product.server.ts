import prisma from "../db.server";

export async function getProducts(storeId: string) {
  return prisma.product.findMany({
    where: { storeId },
    include: { stickyAtcConfig: true, checkoutConfig: true, customReviews: true },
  });
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { stickyAtcConfig: true, checkoutConfig: true, customReviews: true },
  });
}

export async function updateStickyAtcConfig(productId: string, data: any) {
  return prisma.stickyAtcConfig.upsert({
    where: { productId },
    create: {
      productId,
      enabled: data.enabled,
      headline: data.headline,
      subheadline: data.subheadline,
      timerEnabled: data.timerEnabled,
      timerMode: data.timerMode,
      timerEndAt: data.timerEndAt ? new Date(data.timerEndAt) : null,
      autoResetTimer: data.autoResetTimer !== undefined ? data.autoResetTimer : true,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      iconColor: data.iconColor,
      timerBoxColor: data.timerBoxColor,
      timerBoxTextColor: data.timerBoxTextColor,
    },
    update: {
      enabled: data.enabled,
      headline: data.headline,
      subheadline: data.subheadline,
      timerEnabled: data.timerEnabled,
      timerMode: data.timerMode,
      timerEndAt: data.timerEndAt ? new Date(data.timerEndAt) : null,
      autoResetTimer: data.autoResetTimer !== undefined ? data.autoResetTimer : true,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      iconColor: data.iconColor,
      timerBoxColor: data.timerBoxColor,
      timerBoxTextColor: data.timerBoxTextColor,
    },
  });
}

export async function updateCheckoutConfig(productId: string, data: any) {
  return prisma.checkoutConfig.upsert({
    where: { productId },
    create: { 
      productId, 
      enabled: data.enabled,
      showReviews: data.showReviews,
      showRating: data.showRating,
      reviewsSource: data.reviewsSource
    },
    update: {
      enabled: data.enabled,
      showReviews: data.showReviews,
      showRating: data.showRating,
      reviewsSource: data.reviewsSource
    },
  });
}

export async function createCustomReview(productId: string, data: any) {
  return prisma.customReview.create({
    data: {
      productId,
      name: data.name,
      rating: data.rating,
      title: data.title,
      body: data.body,
    },
  });
}

export async function deleteCustomReview(id: string) {
  return prisma.customReview.delete({
    where: { id },
  });
}
