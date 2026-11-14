import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticatePostPurchase, json, logExtensionCall } from "../lib/postPurchaseAuth.server";
import { matchCampaign, publicCampaign } from "../models/thankYou.server";
import { thankYouSignature } from "../lib/addonSignature.server";

// Authenticated with the checkout session token (Bearer). Preflight is answered inside the helper.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchase(request);
  return cors(json({ ok: true }));
};

/** POST { shop, orderId, productIds: string[] } -> { campaign | null, tySig } */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, body, cors } = await authenticatePostPurchase(request, { logSuccess: false });
  try {
    const productIds: string[] = Array.isArray(body.productIds) ? body.productIds.map(String).slice(0, 100) : [];
    const campaign = shop ? await matchCampaign(shop, productIds) : null;
    logExtensionCall(request, 200, shop || null, `campaign=${campaign ? campaign.id : "none"} products=${productIds.length}`);
    // tySig lets the new checkout pass the add-on guard (the add-on price normally needs kids gummies in the cart).
    const tySig = campaign ? thankYouSignature(String(body.orderId || "")) : null;
    return cors(json({ campaign: campaign ? { ...publicCampaign(campaign), tySig } : null }));
  } catch (error) {
    console.error("[Thank-you offer] lookup failed:", error);
    return cors(json({ campaign: null, error: "lookup_failed" }, { status: 500 }));
  }
};
