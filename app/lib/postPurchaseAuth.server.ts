import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Peeks at a bearer token's claims WITHOUT trusting them — for diagnostics only (never for access decisions).
 * Returns which claims are present and whether `aud` matches this app, never the token itself.
 */
function describeToken(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return "no token";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8"));
    const keys = Object.keys(payload).sort().join(",");
    const audOk = payload.aud ? (payload.aud === process.env.SHOPIFY_API_KEY ? "aud=app" : "aud=OTHER") : "aud=missing";
    const exp = payload.exp ? `exp_in=${Math.round(payload.exp - Date.now() / 1000)}s` : "exp=missing";
    return `claims[${keys}] ${audOk} ${exp} dest=${String(payload.dest || payload.iss || "").slice(0, 80)}`;
  } catch {
    return "token not a JWT";
  }
}

/** Fire-and-forget log of an extension call; trims old rows now and then. Never throws. */
export function logExtensionCall(request: Request, status: number, shop: string | null, detail: string | null) {
  const path = new URL(request.url).pathname;
  prisma.extensionLog
    .create({ data: { shop, path, method: request.method, status, detail: detail ? detail.slice(0, 1000) : null } })
    .then(() => {
      if (Math.random() < 0.02) {
        return prisma.extensionLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86400000) } } });
      }
    })
    .catch(() => {});
}

/**
 * Authenticates a request from a checkout extension (post-purchase `inputData.token`, or a checkout UI
 * extension session token) sent as a Bearer token. OPTIONS preflights are answered here too.
 * Returns the shop domain to scope every lookup to, taken from the signed token when present.
 * Every call is logged (status + token shape) so the app can show whether Shopify is reaching us.
 */
export async function authenticatePostPurchase(request: Request, opts: { logSuccess?: boolean } = {}) {
  let sessionToken: unknown;
  let cors: (r: Response) => Response;
  try {
    ({ sessionToken, cors } = await authenticate.public.checkout(request));
  } catch (thrown) {
    const status = thrown instanceof Response ? thrown.status : 500;
    logExtensionCall(
      request,
      status,
      null,
      status === 204 ? "preflight" : `rejected: ${describeToken(request)} ua=${(request.headers.get("user-agent") || "").slice(0, 80)}`,
    );
    throw thrown;
  }
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
  if (request.method !== "OPTIONS" && opts.logSuccess !== false) logExtensionCall(request, 200, shop || null, null);
  return { shop, body, claims, cors };
}

export const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(init?.headers || {}) },
  });
