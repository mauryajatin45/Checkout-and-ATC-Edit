import prisma from "../db.server";

export async function getProducts(storeId: string) {
  return prisma.product.findMany({
    where: { storeId },
    include: { stickyAtcConfig: true, checkoutConfig: true },
  });
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { stickyAtcConfig: true, checkoutConfig: true },
  });
}

export async function updateStickyAtcConfig(productId: string, data: any) {
  return prisma.stickyAtcConfig.upsert({
    where: { productId },
    create: { productId, ...data },
    update: data,
  });
}

export async function updateCheckoutConfig(productId: string, data: any) {
  return prisma.checkoutConfig.upsert({
    where: { productId },
    create: { productId, ...data },
    update: data,
  });
}
