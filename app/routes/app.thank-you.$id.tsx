import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Checkbox,
  Button,
  Banner,
  Thumbnail,
  Select,
  Divider,
  Badge,
  Tag,
  ChoiceList,
  InlineGrid,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ensureStore } from "../models/postPurchase.server";
import { campaignStats, createCampaign, getCampaign, updateCampaign, validateCampaign } from "../models/thankYou.server";
import {
  MAX_TY_ITEMS,
  TY_DEFAULT_COPY,
  parseJsonArray,
  type ThankYouCampaignInput,
  type ThankYouItemInput,
  type TriggerProduct,
} from "../lib/thankYou.shared";

// ─── server ─────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureStore(session.shop, session.accessToken || undefined);
  const isNew = params.id === "new";
  const campaign = isNew ? null : await getCampaign(session.shop, params.id!);
  if (!isNew && !campaign) throw new Response("Offer not found", { status: 404 });
  const stats = isNew ? { byItem: {}, byCampaign: {} } : await campaignStats(session.shop, 30);
  return json({ isNew, campaign, itemStats: stats.byItem, campaignStats: campaign ? stats.byCampaign[campaign.id] || null : null });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  let data: ThankYouCampaignInput;
  try {
    data = JSON.parse(String(form.get("payload") || "{}"));
  } catch {
    return json({ error: "Invalid form data" }, { status: 400 });
  }
  const problem = validateCampaign(data);
  if (problem) return json({ error: problem }, { status: 400 });
  try {
    if (params.id === "new") {
      const created = await createCampaign(session.shop, data);
      return redirect(`/app/thank-you/${created.id}?saved=1`);
    }
    await updateCampaign(session.shop, params.id!, data);
    return json({ ok: true, savedAt: Date.now() });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

// ─── client ─────────────────────────────────────────────────────────────────

interface VariantOption {
  id: string;
  title: string;
  price: string;
  compareAtPrice?: string | null;
  available?: boolean;
  imageUrl?: string | null;
}

interface ItemState extends ThankYouItemInput {
  variants: VariantOption[];
}

const emptyItem = (): ItemState => ({
  productId: "",
  variantId: "",
  productTitle: "",
  variantTitle: "",
  imageUrl: "",
  variantPrice: "",
  compareAtPrice: "",
  maxQuantity: 3,
  skipIfInOrder: false,
  variants: [],
});

const num = (s: unknown) => {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

function itemPricing(it: ItemState, pct: number) {
  const base = num(it.variantPrice);
  const unit = round2(base * (1 - pct / 100));
  const compare = Math.max(num(it.compareAtPrice), base);
  const off = compare > 0 && unit < compare ? (1 - unit / compare) * 100 : 0;
  return { base, unit, compare, off };
}

function fill(text: string | null | undefined, v: { product: string; percent: number; price: number }) {
  return String(text || "")
    .replace(/\{product\}/g, v.product)
    .replace(/\{percent\}/g, String(Math.round(v.percent)))
    .replace(/\{price\}/g, fmt(v.price));
}

export default function ThankYouEditor() {
  const { isNew, campaign, itemStats, campaignStats: cStats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submit = useSubmit();
  const saving = navigation.state === "submitting";

  const c: any = campaign;
  const [name, setName] = useState(c?.name || "Thank-you offer · all orders");
  const [enabled, setEnabled] = useState<boolean>(c?.enabled ?? false);
  const [priority, setPriority] = useState(String(c?.priority ?? 0));
  const [triggerType, setTriggerType] = useState<"all" | "products">(c?.triggerType || "all");
  const [triggers, setTriggers] = useState<TriggerProduct[]>(parseJsonArray<TriggerProduct>(c?.triggerProducts));
  const [timerMinutes, setTimerMinutes] = useState(String(c?.timerMinutes ?? 10));
  const [badgeText, setBadgeText] = useState(c ? c.badgeText || "" : TY_DEFAULT_COPY.badgeText);
  const [headline, setHeadline] = useState(c ? c.headline || "" : TY_DEFAULT_COPY.headline);
  const [subheadline, setSubheadline] = useState(c ? c.subheadline || "" : TY_DEFAULT_COPY.subheadline);
  const [buttonLabel, setButtonLabel] = useState(c ? c.buttonLabel || "" : TY_DEFAULT_COPY.buttonLabel);
  const [smallPrint, setSmallPrint] = useState(c ? c.smallPrint || "" : TY_DEFAULT_COPY.smallPrint);
  const [discountCode, setDiscountCode] = useState(c?.discountCode || "");
  const [discountPercent, setDiscountPercent] = useState(String(c?.discountPercent ?? 0));
  const [items, setItems] = useState<ItemState[]>(
    c?.items?.length ? c.items.map((it: any) => ({ ...it, variants: [] })) : [emptyItem()],
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (actionData?.error) setError(actionData.error);
    if (actionData?.ok) {
      setError(null);
      (window as any).shopify?.toast?.show?.("Offer saved");
    }
  }, [actionData]);

  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("saved")) (window as any).shopify?.toast?.show?.("Offer created");
    items.forEach((it) => it.productId && loadProduct(it.productId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadProduct(productId: string, preferVariant?: string) {
    fetch(`/app/post-purchase/product?id=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then(({ product: p }) => {
        if (!p) return;
        setItems((prev) =>
          prev.map((it) => {
            if (it.productId !== p.id) return it;
            const wanted = preferVariant || it.variantId;
            const v: VariantOption =
              p.variants.find((x: VariantOption) => x.id === wanted) ||
              p.variants.find((x: VariantOption) => x.available) ||
              p.variants[0];
            return {
              ...it,
              variants: p.variants,
              productTitle: it.productTitle || p.title,
              variantId: v?.id || it.variantId,
              variantTitle: v?.title || "",
              variantPrice: v?.price || it.variantPrice,
              compareAtPrice: it.compareAtPrice || v?.compareAtPrice || "",
              imageUrl: it.imageUrl || v?.imageUrl || p.imageUrl || "",
            };
          }),
        );
      })
      .catch(() => setError("Could not load that product. Try again."));
  }

  const updateItem = (i: number, patch: Partial<ItemState>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function pickProduct(i: number) {
    const picker = (window as any).shopify?.resourcePicker;
    if (!picker) return;
    const sel = await picker({ type: "product", action: "select", multiple: false });
    const p = sel?.[0];
    if (!p) return;
    // If a single variant was ticked in the picker, use it.
    const pickedVariant = p.variants?.length === 1 ? p.variants[0]?.id : undefined;
    updateItem(i, { ...emptyItem(), productId: p.id, productTitle: p.title, imageUrl: p.images?.[0]?.originalSrc || "" });
    loadProduct(p.id, pickedVariant);
  }

  async function pickTriggers() {
    const picker = (window as any).shopify?.resourcePicker;
    if (!picker) return;
    const sel = await picker({ type: "product", action: "select", multiple: true, selectionIds: triggers.map((t) => ({ id: t.id })) });
    if (sel) setTriggers(sel.map((p: any) => ({ id: p.id, title: p.title })));
  }

  function save(enabledOverride?: boolean) {
    const live = typeof enabledOverride === "boolean" ? enabledOverride : enabled;
    if (typeof enabledOverride === "boolean") setEnabled(enabledOverride);
    const payload: ThankYouCampaignInput = {
      name,
      enabled: live,
      priority: Number(priority) || 0,
      triggerType,
      triggerProducts: triggers,
      timerMinutes: Number(timerMinutes) || 0,
      badgeText,
      headline,
      subheadline,
      buttonLabel,
      smallPrint,
      discountCode,
      discountPercent: discountCode.trim() ? num(discountPercent) : 0,
      items: items.map(({ variants: _v, ...it }) => ({ ...it, maxQuantity: Number(it.maxQuantity) || 1 })),
    };
    const fd = new FormData();
    fd.append("payload", JSON.stringify(payload));
    submit(fd, { method: "post" });
  }

  const pct = discountCode.trim() ? num(discountPercent) : 0;

  return (
    <Page
      backAction={{ content: "Thank You Page", onAction: () => navigate("/app/thank-you") }}
      title={isNew ? "New thank-you offer" : name}
      titleMetadata={<Badge tone={enabled ? "success" : undefined}>{enabled ? "Live" : "Paused"}</Badge>}
      primaryAction={{ content: "Save", onAction: () => save(), loading: saving }}
      secondaryActions={[{ content: enabled ? "Save & pause" : "Save & go live", onAction: () => save(!enabled), disabled: saving }]}
    >
      <TitleBar title={isNew ? "New thank-you offer" : name} />
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <BlockStack gap="400">
            {cStats && (
              <Card>
                <InlineGrid columns={3} gap="300">
                  {[
                    ["Views (30 days)", cStats.views],
                    ["Buy-now clicks", cStats.clicks],
                    ["Click rate", `${cStats.ctr}%`],
                  ].map(([l, v]) => (
                    <BlockStack key={String(l)} gap="050">
                      <Text as="p" variant="bodySm" tone="subdued">{l}</Text>
                      <Text as="p" variant="headingMd">{String(v)}</Text>
                    </BlockStack>
                  ))}
                </InlineGrid>
              </Card>
            )}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">Offer</Text>
                <TextField label="Internal name" value={name} onChange={setName} autoComplete="off" />
                <ChoiceList
                  title="Show this offer on"
                  choices={[
                    { label: "All orders", value: "all" },
                    { label: "Orders that contain one of these products", value: "products" },
                  ]}
                  selected={[triggerType]}
                  onChange={(v) => setTriggerType(v[0] as any)}
                />
                {triggerType === "products" && (
                  <BlockStack gap="200">
                    <InlineStack>
                      <Button onClick={pickTriggers}>{triggers.length ? "Change trigger products" : "Choose trigger products"}</Button>
                    </InlineStack>
                    <InlineStack gap="100">
                      {triggers.map((t) => (
                        <Tag key={t.id} onRemove={() => setTriggers(triggers.filter((x) => x.id !== t.id))}>{t.title}</Tag>
                      ))}
                    </InlineStack>
                  </BlockStack>
                )}
                <InlineGrid columns={2} gap="300">
                  <TextField label="Countdown timer (minutes)" type="number" value={timerMinutes} onChange={setTimerMinutes} helpText="0 hides the timer." autoComplete="off" />
                  <TextField label="Priority" type="number" value={priority} onChange={setPriority} helpText="Higher wins when several offers match." autoComplete="off" />
                </InlineGrid>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingSm">Products (up to {MAX_TY_ITEMS})</Text>
                  {items.length < MAX_TY_ITEMS && (
                    <Button onClick={() => setItems([...items, emptyItem()])}>{`Add product ${items.length + 1}`}</Button>
                  )}
                </InlineStack>
                {items.map((it, i) => {
                  const pr = itemPricing(it, pct);
                  const st = (it as any).id ? (itemStats as any)[(it as any).id] : null;
                  return (
                    <BlockStack gap="300" key={i}>
                      {i > 0 && <Divider />}
                      <InlineStack align="space-between" blockAlign="center" wrap={false}>
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <Thumbnail size="small" alt="" source={it.imageUrl || "https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"} />
                          <BlockStack gap="050">
                            <Text as="span" fontWeight="semibold">{it.productTitle || "No product selected"}</Text>
                            {it.productId && (
                              <Text as="span" variant="bodySm" tone="subdued">
                                {`Price ${fmt(pr.base)}${pr.compare > pr.base ? ` · compare at ${fmt(pr.compare)}` : ""}${st ? ` · ${st.clicks} clicks` : ""}`}
                              </Text>
                            )}
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="200" wrap={false}>
                          <Button onClick={() => pickProduct(i)}>{it.productId ? "Change" : "Choose product"}</Button>
                          {items.length > 1 && (
                            <Button tone="critical" variant="plain" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                              Remove
                            </Button>
                          )}
                        </InlineStack>
                      </InlineStack>
                      {it.productId && (
                        <>
                          {it.variants.length > 1 && (
                            <Select
                              label="Variant"
                              options={it.variants.map((v) => ({ label: `${v.title} · $${v.price}${v.available ? "" : " (sold out)"}`, value: v.id }))}
                              value={it.variantId}
                              onChange={(id) => {
                                const v = it.variants.find((x) => x.id === id);
                                updateItem(i, { variantId: id, variantTitle: v?.title || "", variantPrice: v?.price || "", compareAtPrice: v?.compareAtPrice || it.compareAtPrice });
                              }}
                            />
                          )}
                          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                            <TextField label="Name shown" value={it.productTitle} onChange={(v) => updateItem(i, { productTitle: v })} autoComplete="off" />
                            <TextField label="Crossed-out price" prefix="$" value={it.compareAtPrice || ""} onChange={(v) => updateItem(i, { compareAtPrice: v })} helpText="Empty = no strike-through." autoComplete="off" />
                            <Select
                              label="Max quantity"
                              options={Array.from({ length: 10 }, (_, n) => ({ label: String(n + 1), value: String(n + 1) }))}
                              value={String(it.maxQuantity || 1)}
                              onChange={(v) => updateItem(i, { maxQuantity: Number(v) })}
                            />
                          </InlineGrid>
                          <TextField label="Image URL" value={it.imageUrl || ""} onChange={(v) => updateItem(i, { imageUrl: v })} autoComplete="off" />
                          <Checkbox label="Hide this product if the order already contains it" checked={!!it.skipIfInOrder} onChange={(v) => updateItem(i, { skipIfInOrder: v })} />
                        </>
                      )}
                    </BlockStack>
                  );
                })}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">Discount (optional)</Text>
                <Text as="p" tone="subdued">
                  Leave empty to sell at the variant's price (e.g. a pre-priced add-on variant). To give a % off, create a discount
                  code in Shopify → Discounts that applies to these products, then enter it here.
                </Text>
                <InlineGrid columns={2} gap="300">
                  <TextField label="Discount code" value={discountCode} onChange={setDiscountCode} placeholder="e.g. THANKYOU20" autoComplete="off" />
                  <TextField label="% off that code gives" type="number" suffix="%" value={discountPercent} onChange={setDiscountPercent} disabled={!discountCode.trim()} helpText="Used to show the price; the code decides the real discount." autoComplete="off" />
                </InlineGrid>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">Copy</Text>
                <Text as="p" variant="bodySm" tone="subdued">You can use {"{product}"}, {"{percent}"} and {"{price}"}; they use the first product.</Text>
                <TextField label="Badge" value={badgeText} onChange={setBadgeText} autoComplete="off" />
                <TextField label="Headline" value={headline} onChange={setHeadline} autoComplete="off" />
                <TextField label="Description" value={subheadline} onChange={setSubheadline} multiline={2} autoComplete="off" />
                <TextField label="Button" value={buttonLabel} onChange={setButtonLabel} autoComplete="off" />
                <TextField label="Small print" value={smallPrint} onChange={setSmallPrint} multiline={2} autoComplete="off" />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <div style={{ position: "sticky", top: 16 }}>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">Live preview</Text>
              <Preview
                items={items}
                pct={pct}
                timerMinutes={Number(timerMinutes) || 0}
                copy={{ badgeText, headline, subheadline, buttonLabel, smallPrint }}
              />
              <Text as="p" variant="bodySm" tone="subdued">
                Shopify draws the real block with your checkout's fonts and colours, in the Thank you page's main column.
              </Text>
            </BlockStack>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Preview({
  items,
  pct,
  timerMinutes,
  copy,
}: {
  items: ItemState[];
  pct: number;
  timerMinutes: number;
  copy: { badgeText: string; headline: string; subheadline: string; buttonLabel: string; smallPrint: string };
}) {
  const shown = items.filter((it) => it.productId);
  const first = shown[0];
  const fp = first ? itemPricing(first, pct) : { unit: 0, off: 0 };
  const tokens = { product: first?.productTitle || "this product", percent: fp.off, price: fp.unit };
  const accent = "#1f7a4d";
  return (
    <div style={{ border: "1px solid #e3e3e3", borderRadius: 12, background: "#fff", padding: 14, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: "#1a1a1a", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        {copy.badgeText ? (
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#b42318", background: "#fde8e7", padding: "3px 8px", borderRadius: 999 }}>
            {fill(copy.badgeText, tokens)}
          </span>
        ) : <span />}
        {timerMinutes > 0 && (
          <span style={{ fontSize: 12 }}>
            Ends in <b style={{ color: "#b42318" }}>{String(timerMinutes).padStart(2, "0")}:00</b>
          </span>
        )}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{fill(copy.headline, tokens)}</div>
      {copy.subheadline && <div style={{ fontSize: 13, color: "#616161" }}>{fill(copy.subheadline, tokens)}</div>}
      {shown.length === 0 && <div style={{ fontSize: 13, color: "#999" }}>Choose a product to see it here.</div>}
      {shown.map((it, i) => {
        const p = itemPricing(it, pct);
        return (
          <div key={i} style={{ borderTop: i ? "1px solid #eee" : undefined, paddingTop: i ? 10 : 0, display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, alignItems: "center" }}>
              {it.imageUrl ? (
                <img src={it.imageUrl} alt="" style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 8, border: "1px solid #eee", background: "#fafafa" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, background: "#f1f1f1" }} />
              )}
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{it.productTitle}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                  {p.compare > p.unit && <span style={{ textDecoration: "line-through", color: "#8a8a8a", fontSize: 13 }}>{fmt(p.compare)}</span>}
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{fmt(p.unit)}</span>
                  {p.off >= 1 && <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{Math.round(p.off)}% OFF</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: (it.maxQuantity || 1) > 1 ? "84px 1fr" : "1fr", gap: 8 }}>
              {(it.maxQuantity || 1) > 1 && (
                <div style={{ border: "1px solid #d4d4d4", borderRadius: 8, padding: "6px 8px", fontSize: 12, color: "#616161" }}>
                  Qty<br /><b style={{ color: "#1a1a1a" }}>1</b>
                </div>
              )}
              <div style={{ background: "#1a1a1a", color: "#fff", borderRadius: 8, display: "grid", placeItems: "center", fontWeight: 600, fontSize: 14, padding: "10px 12px" }}>
                {fill(copy.buttonLabel || "Buy now · {price}", { ...tokens, price: p.unit })}
              </div>
            </div>
          </div>
        );
      })}
      {copy.smallPrint && <div style={{ fontSize: 11, color: "#8a8a8a", textAlign: "center" }}>{fill(copy.smallPrint, tokens)}</div>}
    </div>
  );
}
