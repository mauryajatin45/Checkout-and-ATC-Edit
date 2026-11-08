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
  Box,
  Badge,
  Tag,
  ChoiceList,
  Tabs,
  InlineGrid,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  createFunnel,
  ensureStore,
  funnelStats,
  getFunnel,
  updateFunnel,
  validateFunnel,
} from "../models/postPurchase.server";
import {
  parseJsonArray,
  MAX_STEPS,
  type FunnelInput,
  type OfferInput,
  type TriggerProduct,
} from "../lib/postPurchase.shared";

// ─── server ─────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureStore(session.shop, session.accessToken || undefined);
  const isNew = params.id === "new";
  const funnel = isNew ? null : await getFunnel(session.shop, params.id!);
  if (!isNew && !funnel) throw new Response("Funnel not found", { status: 404 });
  const stats = isNew ? { byOffer: {} } : await funnelStats(session.shop, 30);
  return json({ isNew, funnel, offerStats: stats.byOffer });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  let data: FunnelInput;
  try {
    data = JSON.parse(String(form.get("payload") || "{}"));
  } catch {
    return json({ error: "Invalid form data" }, { status: 400 });
  }
  const problem = validateFunnel(data);
  if (problem) return json({ error: problem }, { status: 400 });
  try {
    if (params.id === "new") {
      const created = await createFunnel(session.shop, data);
      return redirect(`/app/post-purchase/${created.id}?saved=1`);
    }
    await updateFunnel(session.shop, params.id!, data);
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

interface StepState extends Omit<OfferInput, "bullets"> {
  bulletsText: string;
  variants: VariantOption[];
}

const DEFAULT_COPY = {
  badgeText: "ONE-TIME OFFER",
  headline: "Wait! Add {product} for {percent}% off",
  subheadline:
    "Your order is confirmed. Add this with one click and it ships in the same box. This price is only available on this page.",
  bulletsText: [
    "Ships with your order, in the same box",
    "One click: no need to re-enter your card",
    "Covered by our 60-day money-back guarantee",
  ].join("\n"),
  ratingText: "★★★★★ Loved by 1,000+ families",
  guaranteeText: "One-click checkout. You're charged the total shown, on the payment method used for this order.",
  acceptLabel: "Yes! Add to my order · {price}",
  declineLabel: "No thanks, I'll pass on this deal",
};

function emptyStep(position: number): StepState {
  return {
    showWhen: position === 0 ? "always" : "declined",
    skipIfInOrder: true,
    productId: "",
    variantId: "",
    productTitle: "",
    variantTitle: "",
    imageUrl: "",
    variantPrice: "",
    compareAtPrice: "",
    discountPercent: position === 0 ? 50 : 60,
    discountTitle: "Exclusive offer",
    maxQuantity: 3,
    variants: [],
    ...DEFAULT_COPY,
    badgeText: position === 0 ? DEFAULT_COPY.badgeText : "LAST CHANCE",
  };
}

const num = (s: unknown) => {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function fillTokens(text: string, v: { product: string; percent: number; price: number; save: number }) {
  return String(text || "")
    .replace(/\{product\}/g, v.product)
    .replace(/\{percent\}/g, String(Math.round(v.percent)))
    .replace(/\{price\}/g, fmt(v.price))
    .replace(/\{save\}/g, fmt(v.save));
}

function stepPricing(s: StepState, qty = 1) {
  const base = num(s.variantPrice);
  const unit = round2(base * (1 - num(s.discountPercent) / 100));
  const compare = Math.max(num(s.compareAtPrice), base);
  return { base, unit, compare, total: round2(unit * qty), save: round2((compare - unit) * qty) };
}

export default function PostPurchaseEditor() {
  const { isNew, funnel, offerStats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submit = useSubmit();
  const saving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save";

  const [name, setName] = useState(funnel?.name || "Kids gummies → Adult gummies");
  const [enabled, setEnabled] = useState(funnel?.enabled ?? false);
  const [priority, setPriority] = useState(String(funnel?.priority ?? 0));
  const [triggerType, setTriggerType] = useState<"all" | "products">((funnel?.triggerType as any) || "products");
  const [triggers, setTriggers] = useState<TriggerProduct[]>(parseJsonArray<TriggerProduct>(funnel?.triggerProducts));
  const [timerMinutes, setTimerMinutes] = useState(String(funnel?.timerMinutes ?? 10));
  const [steps, setSteps] = useState<StepState[]>(
    funnel?.steps?.length
      ? funnel.steps.map((s: any) => ({
          ...s,
          bulletsText: parseJsonArray<string>(s.bullets).join("\n"),
          variants: [],
        }))
      : [emptyStep(0)],
  );
  const [tab, setTab] = useState(0);
  const [previewQty, setPreviewQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(0);

  useEffect(() => {
    if (actionData?.error) setError(actionData.error);
    if (actionData?.ok) {
      setError(null);
      setSavedFlash(true);
      (window as any).shopify?.toast?.show?.("Funnel saved");
    }
  }, [actionData]);

  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("saved")) (window as any).shopify?.toast?.show?.("Funnel created");
  }, []);

  // Load variant lists for saved steps so the variant picker works.
  useEffect(() => {
    steps.forEach((s, i) => {
      if (s.productId && !s.variants.length) loadProduct(i, s.productId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch a product's variants and prices, then fill every step that offers that product.
  function loadProduct(_stepIndex: number, productId: string) {
    setLoadingProducts((n) => n + 1);
    fetch(`/app/post-purchase/product?id=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then(({ product: p }) => {
        if (!p) return;
        setSteps((prev) =>
          prev.map((s) => {
            if (s.productId !== p.id) return s;
            const keep = p.variants.find((v: VariantOption) => v.id === s.variantId);
            const v: VariantOption = keep || p.variants.find((x: VariantOption) => x.available) || p.variants[0];
            return {
              ...s,
              variants: p.variants,
              productTitle: s.productTitle || p.title,
              variantId: v?.id || s.variantId,
              variantTitle: v?.title || "",
              variantPrice: v?.price || s.variantPrice,
              compareAtPrice: s.compareAtPrice || v?.compareAtPrice || "",
              imageUrl: s.imageUrl || v?.imageUrl || p.imageUrl || "",
            };
          }),
        );
      })
      .catch(() => setError("Could not load that product. Try again."))
      .finally(() => setLoadingProducts((n) => Math.max(0, n - 1)));
  }

  const updateStep = (i: number, patch: Partial<StepState>) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function pickOfferProduct(i: number) {
    const picker = (window as any).shopify?.resourcePicker;
    if (!picker) return;
    const sel = await picker({ type: "product", action: "select", multiple: false });
    const p = sel?.[0];
    if (!p) return;
    updateStep(i, {
      productId: p.id,
      productTitle: p.title,
      imageUrl: p.images?.[0]?.originalSrc || "",
      variantId: "",
      variantPrice: "",
      compareAtPrice: "",
      variants: [],
    });
    loadProduct(i, p.id);
  }

  async function pickTriggers() {
    const picker = (window as any).shopify?.resourcePicker;
    if (!picker) return;
    const sel = await picker({
      type: "product",
      action: "select",
      multiple: true,
      selectionIds: triggers.map((t) => ({ id: t.id })),
    });
    if (sel) setTriggers(sel.map((p: any) => ({ id: p.id, title: p.title })));
  }

  function save() {
    const payload: FunnelInput = {
      name,
      enabled,
      priority: Number(priority) || 0,
      triggerType,
      triggerProducts: triggers,
      timerMinutes: Number(timerMinutes) || 0,
      steps: steps.map((s) => ({
        showWhen: s.showWhen,
        skipIfInOrder: s.skipIfInOrder,
        productId: s.productId,
        variantId: s.variantId,
        productTitle: s.productTitle,
        variantTitle: s.variantTitle,
        imageUrl: s.imageUrl,
        variantPrice: s.variantPrice,
        compareAtPrice: s.compareAtPrice,
        discountPercent: num(s.discountPercent),
        discountTitle: s.discountTitle,
        maxQuantity: Number(s.maxQuantity) || 1,
        badgeText: s.badgeText,
        headline: s.headline,
        subheadline: s.subheadline,
        bullets: s.bulletsText.split("\n"),
        ratingText: s.ratingText,
        guaranteeText: s.guaranteeText,
        acceptLabel: s.acceptLabel,
        declineLabel: s.declineLabel,
      })),
    };
    const fd = new FormData();
    fd.append("intent", "save");
    fd.append("payload", JSON.stringify(payload));
    setSavedFlash(false);
    submit(fd, { method: "post" });
  }

  const current = steps[Math.min(tab, steps.length - 1)];
  const stepTabs = steps.map((s, i) => ({
    id: `step-${i}`,
    content: `Offer ${i + 1}${s.productTitle ? ` · ${s.productTitle.slice(0, 22)}` : ""}`,
  }));

  return (
    <Page
      backAction={{ content: "Post Purchase", onAction: () => navigate("/app/post-purchase") }}
      title={isNew ? "New post-purchase funnel" : name}
      titleMetadata={<Badge tone={enabled ? "success" : undefined}>{enabled ? "Live" : "Paused"}</Badge>}
      primaryAction={{ content: "Save", onAction: save, loading: saving }}
      secondaryActions={[{ content: enabled ? "Pause funnel" : "Set live on save", onAction: () => setEnabled(!enabled) }]}
    >
      <TitleBar title={isNew ? "New funnel" : name} />
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}
        {savedFlash && !error && (
          <Banner tone="success" onDismiss={() => setSavedFlash(false)}>
            Saved. {enabled ? "This funnel is live." : "This funnel is paused: switch it live when you are ready."}
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Funnel</Text>
                  <TextField label="Internal name" value={name} onChange={setName} autoComplete="off" />
                  <ChoiceList
                    title="Show this funnel on"
                    selected={[triggerType]}
                    onChange={(v) => setTriggerType(v[0] as any)}
                    choices={[
                      { label: "Orders that contain one of these products", value: "products" },
                      { label: "All orders", value: "all" },
                    ]}
                  />
                  {triggerType === "products" && (
                    <BlockStack gap="200">
                      <InlineStack gap="200" wrap>
                        {triggers.map((t) => (
                          <Tag key={t.id} onRemove={() => setTriggers(triggers.filter((x) => x.id !== t.id))}>
                            {t.title}
                          </Tag>
                        ))}
                      </InlineStack>
                      <InlineStack>
                        <Button onClick={pickTriggers}>{triggers.length ? "Edit trigger products" : "Choose trigger products"}</Button>
                      </InlineStack>
                    </BlockStack>
                  )}
                  <InlineGrid columns={2} gap="400">
                    <TextField
                      label="Countdown timer (minutes)"
                      type="number"
                      min={0}
                      max={60}
                      value={timerMinutes}
                      onChange={setTimerMinutes}
                      helpText="0 hides the timer."
                      autoComplete="off"
                    />
                    <TextField
                      label="Priority"
                      type="number"
                      value={priority}
                      onChange={setPriority}
                      helpText="Higher wins when several funnels match an order."
                      autoComplete="off"
                    />
                  </InlineGrid>
                  <Checkbox label="Live (shown to customers)" checked={enabled} onChange={setEnabled} />
                </BlockStack>
              </Card>

              <Card padding="0">
                <Tabs tabs={stepTabs} selected={Math.min(tab, steps.length - 1)} onSelect={setTab} />
                <Box padding="400">
                  <StepEditor
                    key={tab}
                    index={Math.min(tab, steps.length - 1)}
                    step={current}
                    stats={(offerStats as any)[(current as any).id]}
                    onChange={(patch) => updateStep(Math.min(tab, steps.length - 1), patch)}
                    onPickProduct={() => pickOfferProduct(Math.min(tab, steps.length - 1))}
                    loadingProduct={loadingProducts > 0}
                    onRemove={
                      steps.length > 1
                        ? () => {
                            setSteps(steps.filter((_, j) => j !== tab));
                            setTab(Math.max(0, tab - 1));
                          }
                        : undefined
                    }
                  />
                </Box>
                {steps.length < MAX_STEPS && (
                  <Box padding="400" borderBlockStartWidth="025" borderColor="border">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" tone="subdued" variant="bodySm">
                        Add a follow-up (e.g. a cheaper downsell after a decline). Shopify allows up to {MAX_STEPS} offers.
                      </Text>
                      <Button
                        onClick={() => {
                          setSteps([...steps, emptyStep(steps.length)]);
                          setTab(steps.length);
                        }}
                      >
                        {`Add offer ${steps.length + 1}`}
                      </Button>
                    </InlineStack>
                  </Box>
                )}
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <div style={{ position: "sticky", top: 16 }}>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Live preview</Text>
                  <Select
                    label="Qty"
                    labelInline
                    options={Array.from({ length: Math.max(1, Number(current.maxQuantity) || 1) }, (_, i) => String(i + 1))}
                    value={String(Math.min(previewQty, Number(current.maxQuantity) || 1))}
                    onChange={(v) => setPreviewQty(Number(v))}
                  />
                </InlineStack>
                <Preview step={current} timerMinutes={Number(timerMinutes) || 0} qty={Math.min(previewQty, Number(current.maxQuantity) || 1)} />
                <Text as="p" variant="bodySm" tone="subdued">
                  Shopify draws the real page with your checkout fonts and colours. Shipping and tax are added from the
                  customer's address.
                </Text>
              </BlockStack>
            </div>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

function StepEditor(props: {
  index: number;
  step: StepState;
  stats?: { views: number; accepts: number; conversion: number; revenue: number };
  onChange: (patch: Partial<StepState>) => void;
  onPickProduct: () => void;
  onRemove?: () => void;
  loadingProduct: boolean;
}) {
  const { index, step: s, stats, onChange, onPickProduct, onRemove, loadingProduct } = props;
  const price = stepPricing(s);
  const [offerPrice, setOfferPrice] = useState(price.base ? price.unit.toFixed(2) : "");

  useEffect(() => {
    setOfferPrice(price.base ? price.unit.toFixed(2) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.variantPrice, s.discountPercent]);

  return (
    <BlockStack gap="400">
      {stats && (
        <InlineStack gap="400">
          <Text as="span" variant="bodySm" tone="subdued">Last 30 days:</Text>
          <Text as="span" variant="bodySm">{stats.views} views</Text>
          <Text as="span" variant="bodySm">{stats.accepts} accepted</Text>
          <Text as="span" variant="bodySm">{stats.conversion}%</Text>
          <Text as="span" variant="bodySm" fontWeight="semibold">{fmt(stats.revenue)}</Text>
        </InlineStack>
      )}

      {index > 0 && (
        <Select
          label="Show this offer"
          value={String(s.showWhen)}
          onChange={(v) => onChange({ showWhen: v as any })}
          options={[
            { label: "After the previous offer was declined (downsell)", value: "declined" },
            { label: "After the previous offer was accepted (upsell)", value: "accepted" },
            { label: "Always, after the previous offer", value: "always" },
          ]}
        />
      )}

      <Text as="h3" variant="headingSm">Product</Text>
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        <Thumbnail source={s.imageUrl || "https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"} alt="" />
        <BlockStack gap="100">
          <Text as="p" fontWeight="semibold">{s.productTitle || "No product selected"}</Text>
          {s.productId && (
            <Text as="p" variant="bodySm" tone="subdued">
              Regular price {fmt(price.base)}
              {num(s.compareAtPrice) > price.base ? ` · compare at ${fmt(num(s.compareAtPrice))}` : ""}
            </Text>
          )}
        </BlockStack>
        <div style={{ marginLeft: "auto" }}>
          <Button onClick={onPickProduct} loading={loadingProduct}>{s.productId ? "Change" : "Choose product"}</Button>
        </div>
      </InlineStack>

      {s.variants.length > 1 && (
        <Select
          label="Variant"
          value={s.variantId}
          onChange={(id) => {
            const v = s.variants.find((x) => x.id === id);
            onChange({
              variantId: id,
              variantTitle: v?.title || "",
              variantPrice: v?.price || "",
              compareAtPrice: v?.compareAtPrice || s.compareAtPrice,
              imageUrl: v?.imageUrl || s.imageUrl,
            });
          }}
          options={s.variants.map((v) => ({
            label: `${v.title} · $${v.price}${v.available === false ? " (sold out)" : ""}`,
            value: v.id,
          }))}
        />
      )}

      <TextField
        label="Product name shown to the customer"
        value={s.productTitle}
        onChange={(v) => onChange({ productTitle: v })}
        autoComplete="off"
      />
      <TextField
        label="Image URL"
        value={s.imageUrl || ""}
        onChange={(v) => onChange({ imageUrl: v })}
        helpText="Defaults to the product image. Square images look best."
        autoComplete="off"
      />

      <Divider />
      <Text as="h3" variant="headingSm">Price</Text>
      <InlineGrid columns={3} gap="300">
        <TextField
          label="Discount %"
          type="number"
          suffix="%"
          value={String(s.discountPercent ?? "")}
          onChange={(v) => onChange({ discountPercent: v as any })}
          autoComplete="off"
        />
        <TextField
          label="Offer price"
          prefix="$"
          value={offerPrice}
          onChange={setOfferPrice}
          onBlur={() => {
            const p = num(offerPrice);
            if (price.base > 0 && p > 0 && p <= price.base) {
              onChange({ discountPercent: round2((1 - p / price.base) * 100) });
            }
          }}
          helpText="Sets the discount for you."
          autoComplete="off"
        />
        <TextField
          label="Crossed-out price"
          prefix="$"
          value={s.compareAtPrice || ""}
          onChange={(v) => onChange({ compareAtPrice: v })}
          helpText="Leave empty to use the regular price."
          autoComplete="off"
        />
      </InlineGrid>
      <InlineGrid columns={2} gap="300">
        <TextField
          label="Discount name on the order"
          value={s.discountTitle || ""}
          onChange={(v) => onChange({ discountTitle: v })}
          autoComplete="off"
        />
        <Select
          label="Max quantity"
          value={String(s.maxQuantity)}
          onChange={(v) => onChange({ maxQuantity: Number(v) })}
          options={["1", "2", "3", "4", "5", "6"].map((v) => ({ label: v === "1" ? "1 (no picker)" : v, value: v }))}
        />
      </InlineGrid>
      <Checkbox
        label="Skip this offer if the order already contains this product"
        checked={!!s.skipIfInOrder}
        onChange={(v) => onChange({ skipIfInOrder: v })}
      />

      <Divider />
      <BlockStack gap="100">
        <Text as="h3" variant="headingSm">Copy</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          You can use {"{product}"}, {"{percent}"}, {"{price}"} and {"{save}"}; they are filled with the real values.
        </Text>
      </BlockStack>
      <TextField label="Badge" value={s.badgeText || ""} onChange={(v) => onChange({ badgeText: v })} autoComplete="off" />
      <TextField label="Headline" value={s.headline || ""} onChange={(v) => onChange({ headline: v })} autoComplete="off" />
      <TextField
        label="Description"
        multiline={3}
        value={s.subheadline || ""}
        onChange={(v) => onChange({ subheadline: v })}
        autoComplete="off"
      />
      <TextField
        label="Benefits (one per line, up to 6)"
        multiline={4}
        value={s.bulletsText}
        onChange={(v) => onChange({ bulletsText: v })}
        autoComplete="off"
      />
      <TextField label="Social proof line" value={s.ratingText || ""} onChange={(v) => onChange({ ratingText: v })} autoComplete="off" />
      <InlineGrid columns={2} gap="300">
        <TextField label="Accept button" value={s.acceptLabel || ""} onChange={(v) => onChange({ acceptLabel: v })} autoComplete="off" />
        <TextField label="Decline link" value={s.declineLabel || ""} onChange={(v) => onChange({ declineLabel: v })} autoComplete="off" />
      </InlineGrid>
      <TextField
        label="Small print under the button"
        multiline={2}
        value={s.guaranteeText || ""}
        onChange={(v) => onChange({ guaranteeText: v })}
        autoComplete="off"
      />

      {onRemove && (
        <InlineStack align="end">
          <Button tone="critical" variant="plain" onClick={onRemove}>{`Remove offer ${index + 1}`}</Button>
        </InlineStack>
      )}
    </BlockStack>
  );
}

/** Approximates what Shopify draws for the post-purchase extension (layout, hierarchy, copy, prices). */
function Preview({ step: s, timerMinutes, qty }: { step: StepState; timerMinutes: number; qty: number }) {
  const p = stepPricing(s, qty);
  const percent = num(s.discountPercent);
  const tokens = { product: s.productTitle || "this product", percent, price: p.total, save: p.save };
  const bullets = s.bulletsText.split("\n").map((b) => b.trim()).filter(Boolean).slice(0, 6);
  const accent = "#1f7a4d";
  const box: React.CSSProperties = {
    border: "1px solid #e3e3e3",
    borderRadius: 12,
    background: "#fff",
    overflow: "hidden",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#1a1a1a",
  };
  return (
    <div style={box}>
      <div style={{ padding: "10px 14px", background: "#f4f6f8", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: accent, fontWeight: 700 }}>✓</span>
        <span>Order confirmed. One last offer before your receipt.</span>
      </div>
      {timerMinutes > 0 && (
        <div style={{ margin: "12px 14px 0", padding: "8px 10px", borderRadius: 8, background: "#fff4e5", fontSize: 13, textAlign: "center" }}>
          This offer expires in <b style={{ color: "#b42318" }}>{String(timerMinutes).padStart(2, "0")}:00</b>
        </div>
      )}
      <div style={{ padding: 14 }}>
        {s.imageUrl ? (
          <img src={s.imageUrl} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", borderRadius: 10, background: "#f6f6f6" }} />
        ) : (
          <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, background: "#f1f1f1", display: "grid", placeItems: "center", color: "#999" }}>
            Product image
          </div>
        )}
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {s.badgeText && (
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#b42318" }}>
              {fillTokens(s.badgeText, tokens)}
              {percent > 0 ? ` · ${Math.round(percent)}% OFF` : ""}
            </div>
          )}
          <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{fillTokens(s.headline || s.productTitle, tokens)}</div>
          {s.ratingText && <div style={{ fontSize: 12, color: "#8a6d00" }}>{fillTokens(s.ratingText, tokens)}</div>}
          {s.subheadline && <div style={{ fontSize: 13, color: "#555", lineHeight: 1.45 }}>{fillTokens(s.subheadline, tokens)}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            {p.compare > p.unit && <s style={{ color: "#8a8a8a", fontSize: 14 }}>{fmt(p.compare * qty)}</s>}
            <span style={{ fontSize: 22, fontWeight: 800 }}>{fmt(p.total)}</span>
            {p.save > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>You save {fmt(p.save)}</span>}
          </div>
          {bullets.length > 0 && (
            <div style={{ display: "grid", gap: 5 }}>
              {bullets.map((b, i) => (
                <div key={i} style={{ fontSize: 13, display: "flex", gap: 6 }}>
                  <span style={{ color: accent, fontWeight: 800 }}>✓</span>
                  <span>{fillTokens(b, tokens)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ borderTop: "1px solid #eee", paddingTop: 8, display: "grid", gap: 3, fontSize: 12, color: "#555" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{fmt(p.total)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Shipping</span><span>Free</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Taxes</span><span>Calculated</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#1a1a1a", fontSize: 14 }}>
              <span>Total</span><span>{fmt(p.total)}</span>
            </div>
          </div>
          <div style={{ background: "#1a1a1a", color: "#fff", textAlign: "center", padding: "12px 10px", borderRadius: 8, fontWeight: 700, fontSize: 14 }}>
            {fillTokens(s.acceptLabel || "Pay now · {price}", tokens)}
          </div>
          <div style={{ textAlign: "center", fontSize: 13, color: "#555", textDecoration: "underline" }}>
            {fillTokens(s.declineLabel || "Decline this offer", tokens)}
          </div>
          {s.guaranteeText && (
            <div style={{ fontSize: 11, color: "#777", textAlign: "center", lineHeight: 1.4 }}>{fillTokens(s.guaranteeText, tokens)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
