import prisma from "../db.server";

export async function getCheckoutTimerSettings(shopDomain: string) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
    include: { checkoutTimer: true },
  });
  
  if (!store) return null;
  
  if (store.checkoutTimer) {
    return store.checkoutTimer;
  }
  
  // Create default if it doesn't exist
  return prisma.checkoutTimerSettings.create({
    data: {
      storeId: store.id,
    },
  });
}

export async function updateCheckoutTimerSettings(shopDomain: string, data: any) {
  const store = await prisma.store.findUnique({
    where: { shopDomain },
  });
  
  if (!store) throw new Error("Store not found");
  
  return prisma.checkoutTimerSettings.upsert({
    where: { storeId: store.id },
    create: {
      storeId: store.id,
      ...data,
    },
    update: {
      ...data,
    },
  });
}
