import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const productsParam = url.searchParams.get("products");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!productsParam) {
    return json({ error: "Missing products parameter" }, { status: 400, headers: corsHeaders });
  }

  const productIds = productsParam.split(",").filter(Boolean);
  
  let imageUrl: string | null = null;
  let aspectRatio: string | null = null;

  for (const pid of productIds) {
    const graphqlId = `gid://shopify/Product/${pid}`;

    const productData = await prisma.product.findUnique({
      where: { id: graphqlId },
      include: { checkoutConfig: true },
    });

    if (productData?.checkoutConfig?.enabled && productData?.checkoutConfig?.checkoutImageUrl) {
      imageUrl = productData.checkoutConfig.checkoutImageUrl;

      // If it's a Cloudinary URL, fetch the image dimensions using fl_getinfo
      if (imageUrl.includes('/upload/')) {
        try {
          const infoUrl = imageUrl.replace('/upload/', '/upload/fl_getinfo/');
          const infoRes = await fetch(infoUrl);
          if (infoRes.ok) {
            const info = await infoRes.json();
            if (info.output?.width && info.output?.height) {
              aspectRatio = `${info.output.width}/${info.output.height}`;
            }
          }
        } catch (e) {
          console.error("[api.image] Failed to fetch Cloudinary info:", e);
        }
      }

      break; // Pick the first product that has an image enabled
    }
  }

  return json({ imageUrl, aspectRatio }, { headers: corsHeaders });
};
