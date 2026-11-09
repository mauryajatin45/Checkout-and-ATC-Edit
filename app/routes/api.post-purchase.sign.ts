import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { authenticatePostPurchase, json } from "../lib/postPurchaseAuth.server";
import { offerChanges } from "../models/postPurchase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchase(request);
  return cors(json({ ok: true }));
};

/**
 * POST { referenceId, offerId, quantity } -> { token }
 * Signs the order change Shopify will apply. The change is rebuilt from the saved offer, so the browser
 * can only pick which offer and how many (up to the offer's max), never the price.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, body, claims, cors } = await authenticatePostPurchase(request);
  const referenceId = String(body.referenceId || "");
  if (!shop || !referenceId || !body.offerId) {
    return cors(json({ error: "missing_parameters" }, { status: 400 }));
  }
  // The customer comes from Shopify's signed token, never from the request body.
  const signedInput = (claims as any)?.input_data?.initialPurchase || {};
  const built = await offerChanges(shop, String(body.offerId), Number(body.quantity) || 1, {
    referenceId: String(signedInput.referenceId || referenceId),
    customerId: signedInput.customerId ? String(signedInput.customerId) : null,
  });
  if (!built) return cors(json({ error: "offer_not_found" }, { status: 404 }));

  const token = jwt.sign(
    {
      iss: process.env.SHOPIFY_API_KEY,
      jti: randomUUID(),
      iat: Date.now(),
      sub: referenceId,
      changes: built.changes,
    },
    process.env.SHOPIFY_API_SECRET || "",
  );
  return cors(json({ token, quantity: built.quantity }));
};
