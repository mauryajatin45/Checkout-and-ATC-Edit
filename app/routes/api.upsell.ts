import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getMatchingUpsell } from "../models/checkoutUpsell.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const sourceParam = url.searchParams.get("source") || url.searchParams.get("source_page");
  const cartProductsParam = url.searchParams.get("cart_products");
  const cartProductIds = cartProductsParam
    ? cartProductsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control, Pragma, X-Requested-With, Origin, Accept",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!shopDomain) {
    return json({ error: "Missing shop parameter" }, { status: 400, headers: corsHeaders });
  }

  const isEditor =
    url.searchParams.get("is_editor") === "true" ||
    url.searchParams.get("preview") === "true";

  try {
    const campaign = await getMatchingUpsell(shopDomain, sourceParam, cartProductIds, isEditor);

    return json(
      {
        campaign: campaign
          ? {
              id: campaign.id,
              name: campaign.name,
              headline: campaign.headline,
              description: campaign.description,
              sourcePage: campaign.sourcePage,
              buttonColor: campaign.buttonColor || "#0066cc",
              buttonTextColor: campaign.buttonTextColor || "#ffffff",
              items: campaign.items.map((item) => ({
                id: item.id,
                shopifyProductId: item.shopifyProductId,
                shopifyVariantId: item.shopifyVariantId,
                title: item.customTitle,
                description: item.customDescription,
                strikethroughPrice: item.strikethroughPrice,
                price: item.price,
                imageUrl: item.imageUrl,
              })),
            }
          : null,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("[API Upsell] Error resolving upsell:", error);
    return json({ campaign: null, error: error.message }, { status: 500, headers: corsHeaders });
  }
};
