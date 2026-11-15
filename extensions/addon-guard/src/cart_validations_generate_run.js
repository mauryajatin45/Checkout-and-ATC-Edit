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
  "67460790878449", // Adult · Special Add-on (thank-you / post-purchase) $17.99
  "67475122258161", // Kids · Add-on Bag $14.99
  "67475122290929", // Kids · Extra Bag $14.99
  "67475122323697", // Kids · Backup Bag $12.99
  "67475123929329", // Kids · Guarantee Bag $18.00
  "67369289154801", // Kids · (1 Bags) $14.99
]);

// Free-shipping extras from the upsells ("Add-ons (ship free with main order)" profile). They need a paid main
// product that ships in the same order (any product), otherwise the shopper gets the item with free shipping.
export const EXTRA_VARIANTS = new Set([
  "48819320127729", // Zoyava Travel Tin $6.99
  "48819323601137", // Zoyava Kids Water Bottle $9.99
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
    for (const line of input.cart.lines) {
      const m = line.merchandise;
      if (!m || m.__typename !== "ProductVariant") continue;
      const id = numericId(m.id);
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
