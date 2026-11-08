import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticatePostPurchase, json } from "../lib/postPurchaseAuth.server";
import { matchCampaign, publicCampaign } from "../models/thankYou.server";

// Authenticated with the checkout session token (Bearer). Preflight is answered inside the helper.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchase(request);
  return cors(json({ ok: true }));
};

/** POST { shop, orderId, productIds: string[] } -> { campaign | null } */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, body, cors } = await authenticatePostPurchase(request);
  try {
    const productIds: string[] = Array.isArray(body.productIds) ? body.productIds.map(String).slice(0, 100) : [];
    const campaign = shop ? await matchCampaign(shop, productIds) : null;
    return cors(json({ campaign: campaign ? publicCampaign(campaign) : null }));
  } catch (error) {
    console.error("[Thank-you offer] lookup failed:", error);
    return cors(json({ campaign: null, error: "lookup_failed" }, { status: 500 }));
  }
};
