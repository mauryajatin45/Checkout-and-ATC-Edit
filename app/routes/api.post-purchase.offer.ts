import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticatePostPurchase, json, logExtensionCall } from "../lib/postPurchaseAuth.server";
import { matchFunnel, publicFunnel, type OrderLine } from "../models/postPurchase.server";

// Preflight (OPTIONS) is answered inside authenticatePostPurchase.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchase(request);
  return cors(json({ ok: true }));
};

/** POST { referenceId, shop, lineItems: [{ productId, variantId, quantity }] } -> { funnel | null } */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, body, cors } = await authenticatePostPurchase(request, { logSuccess: false });
  try {
    const lines: OrderLine[] = Array.isArray(body.lineItems) ? body.lineItems : [];
    const funnel = shop ? await matchFunnel(shop, lines) : null;
    logExtensionCall(request, 200, shop || null, `funnel=${funnel ? funnel.id : "none"} lines=${lines.length}`);
    return cors(json({ funnel: funnel ? publicFunnel(funnel) : null }));
  } catch (error: any) {
    logExtensionCall(request, 500, shop || null, `lookup failed: ${String(error?.message || error).slice(0, 200)}`);
    console.error("[Post-purchase] offer lookup failed:", error);
    return cors(json({ funnel: null, error: "lookup_failed" }, { status: 500 }));
  }
};
