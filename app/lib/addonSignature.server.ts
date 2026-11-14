import { createHmac } from "node:crypto";

/*
 * Thank-you offer signature, checked by the "addon-guard" checkout validation function
 * (extensions/addon-guard). A thank-you offer opens a new checkout that holds only the add-on, so the function
 * can't see the kids gummies that earned the add-on price; this signature proves the checkout came from the
 * thank-you page of a real order. Format: "<YYYY-MM-DD store date>.<32 hex of HMAC-SHA256(key, "<order id>|<date>")>".
 * Valid on the issue date and the next day (store time).
 *
 * The function holds this key as precomputed HMAC midstates: change both together (see the function's TY_KEY).
 */
const TY_SIGNING_KEY = "852983545c20b958cec715c75e00e634e5bbcf07164ad722";
const STORE_TIMEZONE = "America/New_York";

export function storeDate(now = new Date(), timeZone = STORE_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function thankYouSignature(orderId: string, now = new Date()): string | null {
  const id = String(orderId || "").trim();
  if (!/^\d{6,20}$/.test(id)) return null;
  const date = storeDate(now);
  const mac = createHmac("sha256", TY_SIGNING_KEY).update(`${id}|${date}`).digest("hex").slice(0, 32);
  return `${date}.${mac}`;
}
