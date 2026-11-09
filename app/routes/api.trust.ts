import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getTrustBlock, iconSource, parseTrustItems } from "../models/trustBlock.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // Short cache: the block is the same for every buyer, and edits should show within a minute.
  "Cache-Control": "public, max-age=60",
};

/** GET /api/trust?shop=x.myshopify.com -> { enabled, title, items: [{ icon (image src), title, description }] } */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const shop = new URL(request.url).searchParams.get("shop") || "";
  if (!shop) return json({ enabled: false, items: [] }, { status: 400, headers: CORS });
  try {
    const block = await getTrustBlock(shop);
    if (!block || !block.enabled) return json({ enabled: false, items: [] }, { headers: CORS });
    const items = parseTrustItems(block.items).map((it) => ({ ...it, icon: iconSource(it.icon) }));
    return json({ enabled: true, title: block.title, items }, { headers: CORS });
  } catch (err) {
    console.error("[Trust] lookup failed:", err);
    return json({ enabled: false, items: [] }, { status: 500, headers: CORS });
  }
};
