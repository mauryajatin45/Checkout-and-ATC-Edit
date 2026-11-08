import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  EmptyState,
  Box,
  Banner,
  InlineGrid,
  Thumbnail,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  ensureStore,
  listFunnels,
  funnelStats,
  setFunnelEnabled,
  deleteFunnel,
  duplicateFunnel,
} from "../models/postPurchase.server";
import {
  parseJsonArray,
  type TriggerProduct,
} from "../lib/postPurchase.shared";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureStore(session.shop, session.accessToken || undefined);
  const [funnels, stats] = await Promise.all([listFunnels(session.shop), funnelStats(session.shop, 30)]);
  return json({ funnels, stats: stats.byFunnel, shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("id") || "");
  if (!id) return json({ error: "Missing id" }, { status: 400 });
  try {
    if (intent === "toggle") await setFunnelEnabled(session.shop, id, form.get("enabled") === "true");
    else if (intent === "delete") await deleteFunnel(session.shop, id);
    else if (intent === "duplicate") await duplicateFunnel(session.shop, id);
    else return json({ error: "Unknown action" }, { status: 400 });
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PostPurchaseIndex() {
  const { funnels, stats, shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const totals = Object.values(stats).reduce(
    (a, s) => ({ views: a.views + s.views, accepts: a.accepts + s.accepts, revenue: a.revenue + s.revenue }),
    { views: 0, accepts: 0, revenue: 0 },
  );
  const conv = totals.views ? Math.round((totals.accepts / totals.views) * 1000) / 10 : 0;
  const storeHandle = shop.replace(".myshopify.com", "");

  const post = (intent: string, id: string, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.append("intent", intent);
    fd.append("id", id);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    submit(fd, { method: "post" });
  };

  const rows = funnels.map((f, index) => {
    const s = stats[f.id] || { views: 0, accepts: 0, revenue: 0, conversion: 0 };
    const triggers = parseJsonArray<TriggerProduct>(f.triggerProducts);
    const first = f.steps[0];
    return (
      <IndexTable.Row id={f.id} key={f.id} position={index} onClick={() => navigate(`/app/post-purchase/${f.id}`)}>
        <IndexTable.Cell>
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <Thumbnail size="small" alt="" source={first?.imageUrl || "https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"} />
            <BlockStack gap="050">
              <Text as="span" variant="bodyMd" fontWeight="semibold">{f.name}</Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {f.steps.length} offer{f.steps.length === 1 ? "" : "s"} · {first?.productTitle || "—"}
              </Text>
            </BlockStack>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={f.enabled ? "success" : undefined}>{f.enabled ? "Live" : "Paused"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">
            {f.triggerType === "all" ? "All orders" : triggers.map((t) => t.title).join(", ") || "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell><Text as="span" numeric>{s.views.toLocaleString()}</Text></IndexTable.Cell>
        <IndexTable.Cell><Text as="span" numeric>{s.accepts.toLocaleString()}</Text></IndexTable.Cell>
        <IndexTable.Cell><Text as="span" numeric>{s.conversion}%</Text></IndexTable.Cell>
        <IndexTable.Cell><Text as="span" numeric fontWeight="semibold">{money(s.revenue)}</Text></IndexTable.Cell>
        <IndexTable.Cell>
          <div onClick={(e) => e.stopPropagation()}>
            <InlineStack gap="200" align="end" wrap={false}>
              <Button size="micro" disabled={busy} onClick={() => post("toggle", f.id, { enabled: String(!f.enabled) })}>
                {f.enabled ? "Pause" : "Go live"}
              </Button>
              <Button size="micro" disabled={busy} onClick={() => post("duplicate", f.id)}>Duplicate</Button>
              <Button
                size="micro"
                tone="critical"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete "${f.name}"? Its stats are deleted too.`)) post("delete", f.id);
                }}
              >
                Delete
              </Button>
            </InlineStack>
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Post Purchase"
      subtitle="One-click offers shown right after payment, before the thank-you page. Charged to the same card, no re-checkout."
      primaryAction={{ content: "Create funnel", onAction: () => navigate("/app/post-purchase/new") }}
    >
      <TitleBar title="Post Purchase" />
      <Layout>
        <Layout.Section>
          <Banner tone="info" title="Turn the page on in Shopify once your first funnel is live">
            <BlockStack gap="200">
              <Text as="p">
                Shopify runs one post-purchase app at a time. Go to Settings → Checkout → Post-purchase page and pick
                “Checkout and ATC”. Until then the funnels below are saved but not shown to customers.
              </Text>
              <InlineStack>
                <Button url={`https://admin.shopify.com/store/${storeHandle}/settings/checkout#post-purchase`} target="_blank">
                  Open checkout settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
            {[
              ["Views (30 days)", totals.views.toLocaleString()],
              ["Accepted offers", totals.accepts.toLocaleString()],
              ["Conversion", `${conv}%`],
              ["Revenue", money(Math.round(totals.revenue * 100) / 100)],
            ].map(([label, value]) => (
              <Card key={label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
                  <Text as="p" variant="headingLg">{value}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            {funnels.length === 0 ? (
              <Box padding="500">
                <EmptyState
                  heading="Create your first post-purchase funnel"
                  action={{ content: "Create funnel", onAction: () => navigate("/app/post-purchase/new") }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Pick which orders it shows on, the product to offer and the discount. Up to 3 offers per order.</p>
                </EmptyState>
              </Box>
            ) : (
              <IndexTable
                resourceName={{ singular: "funnel", plural: "funnels" }}
                itemCount={funnels.length}
                selectable={false}
                headings={[
                  { title: "Funnel" },
                  { title: "Status" },
                  { title: "Shows on orders with" },
                  { title: "Views", alignment: "end" },
                  { title: "Accepted", alignment: "end" },
                  { title: "Conv.", alignment: "end" },
                  { title: "Revenue", alignment: "end" },
                  { title: "", alignment: "end" },
                ]}
              >
                {rows}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">How a funnel is picked</Text>
              <List>
                <List.Item>Only live funnels are used. When several match an order, the highest priority wins.</List.Item>
                <List.Item>Shopify shows the page only for online-store orders with a shipping address, $0.50 or more.</List.Item>
                <List.Item>An offer is skipped if the order already contains that product (you can turn this off per offer).</List.Item>
                <List.Item>Stats count one view, accept or decline per order and offer. Revenue is what the customer was charged.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
