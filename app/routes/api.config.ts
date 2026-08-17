import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

// Using standard loader to serve the config via App Proxy or direct fetch
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return json({ error: "Missing productId" }, { status: 400 });
  }

  const numericId = productId.replace("gid://shopify/Product/", "");

  try {
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { shopifyProductId: productId },
          { shopifyProductId: `gid://shopify/Product/${numericId}` },
          { id: numericId }
        ]
      },
      include: {
        stickyAtcConfig: true,
      },
    });

    if (!product || !product.stickyAtcConfig) {
      return json({ enabled: false }, {
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    return json(product.stickyAtcConfig, {
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    console.error("Error fetching Sticky ATC config", err);
    return json({ enabled: false }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
};
