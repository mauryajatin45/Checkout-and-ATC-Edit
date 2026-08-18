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

  const allReviews: any[] = [];
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

    const cacheKey = `judgeme_${shopDomain}_${pid}`;
    const cached = cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      allReviews.push(...cached.data);
      continue;
    }

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
        const reviews = data.reviews || [];
        cache.set(cacheKey, { data: reviews, expiry: Date.now() + 10 * 60 * 1000 });
        allReviews.push(...reviews);
      } else {
        debugInfo.judgeMeError = await response.text();
      }
    } catch (err) {
      console.error(`Error fetching Judge.me reviews for product ${pid}`, err);
    }
  }

  return json(
    { reviews: allReviews, _debug: debugInfo },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    }
  );
};
