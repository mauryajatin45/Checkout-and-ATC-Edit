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
import { ensureStore } from "../models/postPurchase.server";
import {
  listCampaigns,
  campaignStats,
  setCampaignEnabled,
  deleteCampaign,
  duplicateCampaign,
} from "../models/thankYou.server";
import { parseJsonArray, type TriggerProduct } from "../lib/thankYou.shared";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureStore(session.shop, session.accessToken || undefined);
  const [campaigns, stats] = await Promise.all([listCampaigns(session.shop), campaignStats(session.shop, 30)]);
  return json({ campaigns, stats: stats.byCampaign, shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("id") || "");
  if (!id) return json({ error: "Missing id" }, { status: 400 });
  try {
    if (intent === "toggle") await setCampaignEnabled(session.shop, id, form.get("enabled") === "true");
    else if (intent === "delete") await deleteCampaign(session.shop, id);
    else if (intent === "duplicate") await duplicateCampaign(session.shop, id);
    else return json({ error: "Unknown action" }, { status: 400 });
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

export default function ThankYouIndex() {
  const { campaigns, stats, shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const busy = useNavigation().state !== "idle";

  const totals = Object.values(stats).reduce((a, s) => ({ views: a.views + s.views, clicks: a.clicks + s.clicks }), {
    views: 0,
    clicks: 0,
  });
  const ctr = totals.views ? Math.round((totals.clicks / totals.views) * 1000) / 10 : 0;
  const storeHandle = shop.replace(".myshopify.com", "");

  const post = (intent: string, id: string, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.append("intent", intent);
    fd.append("id", id);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    submit(fd, { method: "post" });
  };

  const rows = campaigns.map((c, index) => {
    const s = stats[c.id] || { views: 0, clicks: 0, ctr: 0 };
    const triggers = parseJsonArray<TriggerProduct>(c.triggerProducts);
    const first = c.items[0];
    return (
      <IndexTable.Row id={c.id} key={c.id} position={index} onClick={() => navigate(`/app/thank-you/${c.id}`)}>
        <IndexTable.Cell>
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <Thumbnail size="small" alt="" source={first?.imageUrl || "https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"} />
            <BlockStack gap="050">
              <Text as="span" variant="bodyMd" fontWeight="semibold">{c.name}</Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {c.items.length} product{c.items.length === 1 ? "" : "s"}
                {c.discountCode ? ` · code ${c.discountCode}` : ""}
                {" · "}
                {c.triggerType === "all" ? "All orders" : triggers.map((t) => t.title).join(", ") || "—"}
              </Text>
            </BlockStack>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={c.enabled ? "success" : undefined}>{c.enabled ? "Live" : "Paused"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell><Text as="span" numeric>{s.views.toLocaleString()}</Text></IndexTable.Cell>
        <IndexTable.Cell><Text as="span" numeric>{s.clicks.toLocaleString()}</Text></IndexTable.Cell>
        <IndexTable.Cell><Text as="span" numeric>{s.ctr}%</Text></IndexTable.Cell>
        <IndexTable.Cell>
          <div onClick={(e) => e.stopPropagation()}>
            <InlineStack gap="100" wrap={false}>
              <Button size="micro" disabled={busy} onClick={() => post("toggle", c.id, { enabled: String(!c.enabled) })}>
                {c.enabled ? "Pause" : "Go live"}
              </Button>
              <Button size="micro" disabled={busy} onClick={() => post("duplicate", c.id)}>Copy</Button>
              <Button
                size="micro"
                tone="critical"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete "${c.name}"? Its stats are deleted too.`)) post("delete", c.id);
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
      title="Thank You Page"
      subtitle="A last offer on Shopify's Thank you page. “Buy now” opens a quick new checkout with the customer's details filled in."
      primaryAction={{ content: "Create offer", onAction: () => navigate("/app/thank-you/new") }}
    >
      <TitleBar title="Thank You Page" />
      <Layout>
        <Layout.Section>
          <Banner tone="info" title="Add the block to the Thank you page once">
            <BlockStack gap="200">
              <Text as="p">
                In the checkout editor, open the Thank you page, click “Add block” and choose “Thank You Offer”. Place it under
                the confirmation, where Upsell.com's slot is today, and remove that slot so customers don't see two offers.
              </Text>
              <InlineStack>
                <Button url={`https://admin.shopify.com/store/${storeHandle}/settings/checkout/editor?page=thank-you`} target="_blank">
                  Open checkout editor
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            {[
              ["Views (30 days)", totals.views.toLocaleString()],
              ["“Buy now” clicks", totals.clicks.toLocaleString()],
              ["Click rate", `${ctr}%`],
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
            {campaigns.length === 0 ? (
              <Box padding="500">
                <EmptyState
                  heading="Create your first thank-you offer"
                  action={{ content: "Create offer", onAction: () => navigate("/app/thank-you/new") }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Pick up to 3 products, an optional discount code and the copy. Shown to every customer after checkout.</p>
                </EmptyState>
              </Box>
            ) : (
              <IndexTable
                resourceName={{ singular: "offer", plural: "offers" }}
                itemCount={campaigns.length}
                selectable={false}
                headings={[
                  { title: "Offer" },
                  { title: "Status" },
                  { title: "Views", alignment: "end" },
                  { title: "Clicks", alignment: "end" },
                  { title: "CTR", alignment: "end" },
                  { title: "" },
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
              <Text as="h2" variant="headingSm">How it works</Text>
              <List>
                <List.Item>
                  The order is already complete on the Thank you page, so the offer can't be added to it. “Buy now” opens a new
                  checkout with the product, quantity, the customer's email and address, and your discount code filled in.
                </List.Item>
                <List.Item>Shown to every customer, including Apple Pay, Google Pay and PayPal orders that skip the post-purchase page.</List.Item>
                <List.Item>Only live offers are used. When several match an order, the highest priority wins.</List.Item>
                <List.Item>Prices are read live from your store, so a price change shows up right away.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
