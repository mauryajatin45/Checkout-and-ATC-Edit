import prisma from "../db.server";
import { execSync } from "child_process";

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

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadImageToCloudinary(base64Str: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(base64Str, { folder: "shopify_reviews" }, (error, result) => {
      if (error) reject(error);
      else resolve(result!.secure_url);
    });
  });
}

export async function createCustomReview(productId: string, data: any) {
  try {
    return await prisma.customReview.create({
      data: {
        productId,
        name: data.name,
        rating: data.rating,
        title: data.title,
        body: data.body,
        imageUrl: data.imageUrl,
      },
    });
  } catch (error: any) {
    // If table doesn't exist (P2021) or similar Prisma error, auto-migrate and retry
    if (error.code === 'P2021' || error.message?.includes("does not exist")) {
      console.log("Table missing, auto-running prisma db push...");
      execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
      console.log("Database updated. Retrying review creation...");
      
      return await prisma.customReview.create({
        data: {
          productId,
          name: data.name,
          rating: data.rating,
          title: data.title,
          body: data.body,
          imageUrl: data.imageUrl,
        },
      });
    }
    throw error;
  }
}

export async function deleteCustomReview(id: string) {
  return prisma.customReview.delete({
    where: { id },
  });
}
