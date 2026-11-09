import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticatePostPurchase, json } from "../lib/postPurchaseAuth.server";
import { confirmNextBox, recordEvent } from "../models/postPurchase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchase(request);
  return cors(json({ ok: true }));
};

/** POST { funnelId, offerId, type: view|accept|decline|error, referenceId, quantity, revenue, currency, detail } */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, body, cors } = await authenticatePostPurchase(request);
  try {
    if (shop && body.funnelId && body.type) {
      await recordEvent(shop, {
        funnelId: String(body.funnelId),
        offerId: body.offerId ? String(body.offerId) : null,
        type: String(body.type),
        referenceId: body.referenceId ? String(body.referenceId) : null,
        quantity: body.quantity ?? null,
        revenue: body.revenue ?? null,
        currency: body.currency ?? null,
        detail: body.detail ? String(body.detail) : null,
      });
      if (body.type === "accept" && body.offerId && body.referenceId) {
        await confirmNextBox(String(body.referenceId), String(body.offerId));
      }
    }
  } catch (error) {
    console.error("[Post-purchase] event failed:", error);
  }
  return cors(json({ ok: true }));
};
