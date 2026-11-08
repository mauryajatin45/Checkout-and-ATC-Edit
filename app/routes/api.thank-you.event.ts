import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticatePostPurchase, json } from "../lib/postPurchaseAuth.server";
import { recordTyEvent } from "../models/thankYou.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchase(request);
  return cors(json({ ok: true }));
};

/** POST { campaignId, itemId, type: view|click, referenceId, quantity } */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, body, cors } = await authenticatePostPurchase(request);
  try {
    if (shop && body.campaignId && body.type) {
      await recordTyEvent(shop, {
        campaignId: String(body.campaignId),
        itemId: body.itemId ? String(body.itemId) : null,
        type: String(body.type),
        referenceId: body.referenceId ? String(body.referenceId) : null,
        quantity: body.quantity ?? null,
      });
    }
  } catch (error) {
    console.error("[Thank-you offer] event failed:", error);
  }
  return cors(json({ ok: true }));
};
