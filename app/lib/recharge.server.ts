/**
 * Minimal Recharge API client (API version 2021-11) for the post-purchase "add to my next box" offer.
 * The token comes from the RECHARGE_API_TOKEN environment variable and never leaves the server.
 * Token permissions needed: subscriptions read/write; customers, addresses, charges, products read.
 */

const BASE = "https://api.rechargeapps.com";

export class RechargeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function rechargeConfigured() {
  return !!process.env.RECHARGE_API_TOKEN;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env.RECHARGE_API_TOKEN;
  if (!token) throw new RechargeError("RECHARGE_API_TOKEN is not set", 0);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "X-Recharge-Access-Token": token,
      "X-Recharge-Version": "2021-11",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new RechargeError(`Recharge ${method} ${path.split("?")[0]} ${res.status}: ${text.slice(0, 300)}`, res.status);
  return (text ? JSON.parse(text) : {}) as T;
}

export interface RcSubscription {
  id: number;
  address_id: number;
  customer_id: number;
  status: string;
  next_charge_scheduled_at: string | null;
  price: string | number;
  external_product_id?: { ecommerce?: string };
  external_variant_id?: { ecommerce?: string };
  product_title?: string;
}

export async function findCustomerByShopifyId(shopifyCustomerId: string) {
  const r = await call<{ customers: Array<{ id: number; email: string }> }>(
    "GET",
    `/customers?external_customer_id=${encodeURIComponent(shopifyCustomerId)}`,
  );
  return r.customers?.[0] || null;
}

export async function activeSubscriptions(customerId: number) {
  const r = await call<{ subscriptions: RcSubscription[] }>("GET", `/subscriptions?customer_id=${customerId}&status=active&limit=50`);
  return r.subscriptions || [];
}

export async function getSubscription(id: string | number) {
  const r = await call<{ subscription: RcSubscription }>("GET", `/subscriptions/${id}`);
  return r.subscription;
}

export async function createSubscription(input: {
  addressId: number;
  productId: string;
  variantId: string;
  productTitle?: string | null;
  variantTitle?: string | null;
  price: string;
  intervalDays: number;
  nextChargeDate: string; // YYYY-MM-DD
}) {
  const r = await call<{ subscription: RcSubscription }>("POST", "/subscriptions", {
    address_id: input.addressId,
    external_product_id: { ecommerce: input.productId },
    external_variant_id: { ecommerce: input.variantId },
    product_title: input.productTitle || undefined,
    variant_title: input.variantTitle || undefined,
    quantity: 1,
    price: Number(input.price),
    order_interval_unit: "day",
    order_interval_frequency: input.intervalDays,
    charge_interval_frequency: input.intervalDays,
    next_charge_scheduled_at: input.nextChargeDate,
  });
  return r.subscription;
}

export async function setSubscriptionPrice(id: string | number, price: string) {
  const r = await call<{ subscription: RcSubscription }>("PUT", `/subscriptions/${id}`, { price: Number(price) });
  return r.subscription;
}
