// @ts-check
// Add-on guard (Zoyava): the discounted add-on variants are only sold together with paid Kids Zeolite Gummies.
//
//  • In-cart / checkout add-ons ($19.99 adult popup, $19.99 checkout add-on, $14.99 kids bag …) need a paid
//    kids gummies line in the same checkout. Taking the kids gummies out puts the checkout back to "remove the
//    add-on" instead of selling it at the add-on price.
//  • Thank-you page offers open a new checkout that only holds the add-on. They pass when the cart carries a
//    `_ty_sig` attribute signed by our backend for the order they came from (valid on the day it was issued and
//    the next day, store time). A hand-made cart link can't produce that signature.
//  • Travel Tin / Water Bottle (free-shipping extras) need any paid product that ships in the same order.
//  • Post-purchase offers are added to the original order (no checkout), so this function never sees them.
//
// Errors are only raised at checkout, never while the cart is being edited, so the theme can add the kids
// gummies and the add-on in either order.

import { hmacHexFromMidstates } from "./hmac.js";

/**
 * @typedef {import("../generated/api").CartValidationsGenerateRunInput} CartValidationsGenerateRunInput
 * @typedef {import("../generated/api").CartValidationsGenerateRunResult} CartValidationsGenerateRunResult
 */

// Discounted add-on variants (Zoyava). Regular-priced variants are not listed.
export const ADDON_VARIANTS = new Set([
  "67458285535473", // Adult · Add-on with Kids Gummies (popup) $19.99
  "67475121537265", // Adult · Checkout Add-on $19.99
  "67460790878449", // Adult · Special Add-on (post-purchase) $17.99
  "67560894431473", // Adult · Thank-you Add-on $17.99 (own order: Standard $5 shipping profile)
  "67475122258161", // Kids · Add-on Bag $14.99
  "67475122290929", // Kids · Extra Bag $14.99
  "67475122323697", // Kids · Backup Bag $12.99
  "67475123929329", // Kids · Guarantee Bag $18.00
  "67369289154801", // Kids · (1 Bags) $14.99
  "48740950376689", // Kids (zeolite-kids-gummies) · (1 Bags) $14.99 post-purchase bag
]);

// Free-shipping extras from the upsells ("Add-ons (ship free with main order)" profile). They need a paid main
// product that ships in the same order (any product), otherwise the shopper gets the item with free shipping.
export const EXTRA_VARIANTS = new Set([
  "48819320127729", // Zoyava Travel Tin $6.99
  "48819323601137", // Zoyava Kids Water Bottle $9.99
]);

// BOGO test page (zeolite-kids-detox-gummies-bogo): the $0 gifts are only earned by the bundle variants (sub or one-time).
// Per bundle bought: Buy 2 Get 1 = 1 free bag + 1 free PDF guide; Buy 3 Get 2 = 2 free bags + 1 free PDF guide + 1 Travel Tin.
// Any gift above that allowance blocks checkout.
export const FREE_BAG_VARIANT = "67553847869681";
export const FREE_GIFTS = {
  "67553847869681": "bag", // Zeolite Kids Detox Gummies — Free Bonus Bag
  "67555315646705": "pdf", // Calm Routines: A Parent's Guide — Free Gift (digital)
  "67555314794737": "tin", // Zoyava Travel Tin — Free Gift
  // Spanish BOGO page (gomitas-desintoxicantes-de-zeolita-para-ninos-bogo) — same gifts under Spanish names
  "67591397310705": "bag", // Gomitas de Zeolita para Niños — Bolsa Gratis de Regalo
  "67591397474545": "pdf", // Rutinas Tranquilas: Guía para Padres — Regalo Gratis (digital)
  "67591397572849": "tin", // Estuche de Viaje Zoyava — Regalo Gratis
};
export const FREE_BAG_EARNERS = new Map([
  ["67553827029233", { bag: 1, pdf: 1, tin: 0 }], // Buy 2 Get 1 Free
  ["67553827062001", { bag: 2, pdf: 1, tin: 1 }], // Buy 3 Get 2 Free
  ["67591397114097", { bag: 1, pdf: 1, tin: 0 }], // ES: Compra 2 y llévate 1 (2 Bolsas)
  ["67591397146865", { bag: 2, pdf: 1, tin: 1 }], // ES: Compra 3 y llévate 2 (3 Bolsas)
]);

// HMAC key of the backend's thank-you signature (app/lib/addonSignature.server.ts), as its precomputed ipad/opad
// SHA-256 states so a check costs two compressions instead of four. Regenerate both sides together:
//   node --input-type=module -e "import {hmacMidstates} from './src/hmac.js'; console.log(JSON.stringify(hmacMidstates(KEY)))"
const TY_KEY = {
  inner: [-436333828, -1390643748, -523190590, -1693894468, -251659377, -784791963, 1189425971, -653043141],
  outer: [-336699254, 1524524681, 949193770, -442274027, 893398202, 1106465276, 464436963, 1504611118],
};

const KIDS_HANDLE = /(zeolite-kids|zeoshield|zeolita-para-ninos)/;
const NOT_KIDS_HANDLE = /(upsell|free-bonus)/;

const numericId = (gid) => String(gid || "").split("/").pop() || "";

/** Day before a YYYY-MM-DD date. */
function previousDay(date) {
  const t = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(t)) return "";
  return new Date(t - 86400000).toISOString().slice(0, 10);
}

/** `_ty_sig` = "<YYYY-MM-DD>.<first 32 hex of HMAC-SHA256(secret, "<order id>|<YYYY-MM-DD>")>" */
export function validThankYouSignature(fromOrder, sig, today) {
  if (!fromOrder || !sig || !today) return false;
  const dot = sig.indexOf(".");
  if (dot < 0) return false;
  const date = sig.slice(0, dot);
  const mac = sig.slice(dot + 1).toLowerCase();
  if (date !== today && date !== previousDay(today)) return false;
  const expected = hmacHexFromMidstates(TY_KEY, `${String(fromOrder).trim()}|${date}`).slice(0, 32);
  return mac.length === 32 && mac === expected;
}

/**
 * @param {CartValidationsGenerateRunInput} input
 * @returns {CartValidationsGenerateRunResult}
 */
export function cartValidationsGenerateRun(input) {
  const errors = [];
  const step = input.buyerJourney && input.buyerJourney.step;

  if (step !== "CART_INTERACTION") {
    let addons = 0;
    let extras = 0;
    let paidKids = 0;
    let paidMain = 0;
    const gifts = { bag: 0, pdf: 0, tin: 0 };
    const allowance = { bag: 0, pdf: 0, tin: 0 };
    for (const line of input.cart.lines) {
      const m = line.merchandise;
      if (!m || m.__typename !== "ProductVariant") continue;
      const id = numericId(m.id);
      const gift = FREE_GIFTS[id];
      if (gift) {
        gifts[gift] += line.quantity;
        continue;
      }
      const earn = FREE_BAG_EARNERS.get(id);
      if (earn) for (const k in earn) allowance[k] += line.quantity * earn[k];
      if (ADDON_VARIANTS.has(id)) {
        addons += line.quantity;
        continue;
      }
      if (EXTRA_VARIANTS.has(id)) {
        extras += line.quantity;
        continue;
      }
      const handle = String((m.product && m.product.handle) || "").toLowerCase();
      const paid = Number(line.cost && line.cost.totalAmount && line.cost.totalAmount.amount) > 0;
      if (!paid) continue;
      if (m.requiresShipping !== false) paidMain += line.quantity;
      if (KIDS_HANDLE.test(handle) && !NOT_KIDS_HANDLE.test(handle)) paidKids += line.quantity;
    }

    const es = String((input.localization && input.localization.language && input.localization.language.isoCode) || "EN")
      .toUpperCase()
      .startsWith("ES");
    if (gifts.bag > allowance.bag || gifts.pdf > allowance.pdf || gifts.tin > allowance.tin) {
      errors.push({
        message: es
          ? "Los regalos gratis solo se incluyen con los paquetes Compra 2 y llévate 1 o Compra 3 y llévate 2. Elige un paquete o elimina el regalo."
          : "Free gifts only come with the Buy 2 Get 1 or Buy 3 Get 2 bundles. Please choose a bundle or remove the extra free item.",
        target: "$.cart",
      });
    }
    if ((addons > 0 && paidKids === 0) || (extras > 0 && paidMain === 0)) {
      const today = input.shop && input.shop.localTime && input.shop.localTime.date;
      const fromOrder = input.cart.fromOrder && input.cart.fromOrder.value;
      const sig = input.cart.tySig && input.cart.tySig.value;
      const signed = validThankYouSignature(fromOrder, sig, today);
      if (!signed && addons > 0 && paidKids === 0) {
        errors.push({
          message: es
            ? "El precio especial del complemento solo está disponible junto con las Gomitas de Zeolita para Niños. Agrega las gomitas para niños o elimina el complemento."
            : "The add-on price is only available together with Kids Zeolite Gummies. Please add the Kids Gummies or remove the add-on.",
          target: "$.cart",
        });
      } else if (!signed && extras > 0 && paidMain === 0) {
        errors.push({
          message: es
            ? "El estuche de viaje y la botella de agua son complementos y solo se venden junto con un pedido principal. Agrega un producto o elimina el complemento."
            : "The Travel Tin and Water Bottle are add-ons and are only sold together with a main order. Please add a product or remove the add-on.",
          target: "$.cart",
        });
      }
    }
  }

  return { operations: [{ validationAdd: { errors } }] };
}
