import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

// Simple in-memory cache for demonstration. In production, use Redis or DB.
const cache = new Map<string, { data: any; expiry: number }>();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productsParam = url.searchParams.get("products");

  if (!productsParam) {
    return json({ error: "Missing products parameter" }, { status: 400 });
  }

  const productIds = productsParam.split(",").filter(Boolean);
  const shopDomain = url.searchParams.get("shop") || "a94f3b-3.myshopify.com";
  
  const token = process.env.JUDGEME_PRIVATE_TOKEN;
  
  if (!token) {
    return json({ error: "Judge.me token not configured" }, { status: 500 });
  }

  let bestProductReviews: any[] = [];
  let highestAvgRating = 0;
  let highestReviewCount = 0;

  const debugInfo: any = { requestedProducts: productIds, shopDomain, tokenConfigured: !!token, productConfigs: [] };

  for (const pid of productIds) {
    const graphqlId = `gid://shopify/Product/${pid}`;

    const productData = await prisma.product.findUnique({
      where: { id: graphqlId },
      include: { checkoutConfig: true },
    });

    const isEnabled = !!productData?.checkoutConfig?.enabled;
    debugInfo.productConfigs.push({ pid, isEnabled });

    if (!isEnabled) {
      continue;
    }

    let productReviews: any[] = [];
    const cacheKey = `judgeme_${shopDomain}_${pid}`;
    const cached = cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      productReviews = cached.data;
    } else {
      try {
      // 1. Fetch the internal Judge.me product ID using the Shopify Product ID
      const productLookup = await fetch(
        `https://judge.me/api/v1/products/-1?api_token=${token}&shop_domain=${shopDomain}&external_id=${pid}`
      );

      if (!productLookup.ok) {
        debugInfo.judgeMeError = await productLookup.text();
        continue;
      }

      const productDataResult = await productLookup.json();
      const judgeMeProductId = productDataResult?.product?.id;

      if (!judgeMeProductId) {
        debugInfo.judgeMeError = "Product found but no Judge.me ID returned.";
        continue;
      }

      // 2. Fetch the reviews using the internal Judge.me product ID
      const response = await fetch(
        `https://judge.me/api/v1/reviews?api_token=${token}&shop_domain=${shopDomain}&product_id=${judgeMeProductId}&per_page=5`
      );

      if (response.ok) {
        const data = await response.json();
        productReviews = data.reviews || [];
        cache.set(cacheKey, { data: productReviews, expiry: Date.now() + 10 * 60 * 1000 });
      } else {
        debugInfo.judgeMeError = await response.text();
      }
    } catch (err) {
      console.error(`Error fetching Judge.me reviews for product ${pid}`, err);
    }
    }
    
    // Evaluate reviews for this product
    if (productReviews.length > 0) {
      // 1. Filter out reviews with less than 4 stars
      const filteredReviews = productReviews.filter((r: any) => r.rating >= 4);
      
      if (filteredReviews.length > 0) {
        // 2. Calculate average rating of these valid reviews
        const avgRating = filteredReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / filteredReviews.length;
        
        // 3. Determine if this product has the highest rating so far
        // Tie-breaker: if ratings are equal, prefer the one with more reviews
        if (
          avgRating > highestAvgRating || 
          (avgRating === highestAvgRating && filteredReviews.length > highestReviewCount)
        ) {
          highestAvgRating = avgRating;
          highestReviewCount = filteredReviews.length;
          bestProductReviews = filteredReviews;
        }
      }
    }
  }

  return json(
    { reviews: bestProductReviews, _debug: debugInfo },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    }
  );
};
