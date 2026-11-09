import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticatePostPurchase, json, logExtensionCall } from "../lib/postPurchaseAuth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticatePostPurchase(request, { logSuccess: false });
  return cors(json({ ok: true }));
};

/** POST { stage, detail } from the post-purchase extension: where it got to (render start, exceptions). */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, body, cors } = await authenticatePostPurchase(request, { logSuccess: false });
  const stage = String(body.stage || "").slice(0, 60);
  const detail = String(body.detail || "").slice(0, 600);
  logExtensionCall(request, 200, shop || null, `${stage}${detail ? `: ${detail}` : ""} ref=${String(body.referenceId || "").slice(-12)}`);
  return cors(json({ ok: true }));
};
