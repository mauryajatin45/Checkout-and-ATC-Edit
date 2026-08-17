import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

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

  for (const pid of productIds) {
    const cacheKey = `judgeme_${shopDomain}_${pid}`;
    const cached = cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      allReviews.push(...cached.data);
      continue;
    }

    try {
      const response = await fetch(
        `https://judge.me/api/v1/reviews?api_token=${token}&shop_domain=${shopDomain}&product_id=${pid}&per_page=5`
      );

      if (response.ok) {
        const data = await response.json();
        const reviews = data.reviews || [];
        
        // Cache for 10 minutes
        cache.set(cacheKey, { data: reviews, expiry: Date.now() + 10 * 60 * 1000 });
        allReviews.push(...reviews);
      }
    } catch (err) {
      console.error(`Error fetching Judge.me reviews for product ${pid}`, err);
    }
  }

  // Ensure CORS headers are sent so the checkout extension can fetch it
  return json(
    { reviews: allReviews },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    }
  );
};
