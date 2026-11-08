import { authenticate } from "../shopify.server";

/**
 * Authenticates a request from the post-purchase extension. The extension sends `inputData.token`
 * (signed by Shopify with this app's secret) as a Bearer token. OPTIONS preflights are answered here too.
 * Returns the shop domain to scope every lookup to, taken from the signed token when present.
 */
export async function authenticatePostPurchase(request: Request) {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  const claims = sessionToken as unknown as Record<string, unknown>;
  let body: Record<string, any> = {};
  if (request.method === "POST") {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }
  const fromToken = String(claims.dest || claims.iss || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const shop = (fromToken.endsWith(".myshopify.com") ? fromToken : "") || String(body.shop || "").trim();
  return { shop, body, claims, cors };
}

export const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(init?.headers || {}) },
  });
