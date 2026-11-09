import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { ImportExportCard } from "../components/ImportExportCard";
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
import prisma from "../db.server";
import {
  ensureStore,
  listFunnels,
  funnelStats,
  setFunnelEnabled,
  deleteFunnel,
  duplicateFunnel,
  nextBoxSummary,
  getFunnel,
  createFunnel,
  updateFunnel,
  validateFunnel,
} from "../models/postPurchase.server";
import { rechargeConfigured } from "../lib/recharge.server";
import {
  parseJsonArray,
  type TriggerProduct,
} from "../lib/postPurchase.shared";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureStore(session.shop, session.accessToken || undefined);
  const since = new Date(Date.now() - 48 * 3600000);
  const [funnels, stats, callGroups, recentCalls, nextBox] = await Promise.all([
    listFunnels(session.shop),
    funnelStats(session.shop, 30),
    prisma.extensionLog.groupBy({
      by: ["path", "status"],
      where: { createdAt: { gte: since }, path: { startsWith: "/api/post-purchase" } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.extensionLog.findMany({
      where: { path: { startsWith: "/api/post-purchase" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { path: true, method: true, status: true, detail: true, createdAt: true },
    }),
    nextBoxSummary(session.shop),
  ]);
  return json({
    funnels,
    stats: stats.byFunnel,
    shop: session.shop,
    callGroups,
    recentCalls,
    nextBox,
    rechargeReady: rechargeConfigured(),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("id") || "");
  if (intent === "import") {
    try {
      const list = JSON.parse(String(form.get("payload") || "[]"));
      if (!Array.isArray(list)) throw new Error("Expected a JSON array of funnels");
      // Validate everything first, so a bad entry doesn't leave a half-imported set.
      for (const [i, f] of list.entries()) {
        const problem = validateFunnel(f);
        if (problem) throw new Error(`Funnel ${i + 1} (${f?.name || "no name"}): ${problem}`);
      }
      for (const f of list) {
        if (f.id && (await getFunnel(session.shop, String(f.id)))) await updateFunnel(session.shop, String(f.id), f);
        else await createFunnel(session.shop, f);
      }
      return json({ ok: true, message: `Imported ${list.length} funnel(s)` });
    } catch (err: any) {
      return json({ error: `Import failed: ${err.message}` }, { status: 400 });
    }
  }
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
  const { funnels, stats, shop, callGroups, recentCalls, nextBox, rechargeReady } = useLoaderData<typeof loader>();
  const importResult = useActionData<typeof action>() as any;
  const exportJson = JSON.stringify(
    funnels.map((f: any) => ({
      id: f.id,
      name: f.name,
      enabled: f.enabled,
      priority: f.priority,
      triggerType: f.triggerType,
      triggerProducts: parseJsonArray(f.triggerProducts),
      buyerType: f.buyerType,
      includeVariants: parseJsonArray(f.includeVariants),
      excludeVariants: parseJsonArray(f.excludeVariants),
      timerMinutes: f.timerMinutes,
      steps: f.steps.map(({ id: _id, funnelId: _f, createdAt: _c, updatedAt: _u, position: _p, bullets, ...rest }: any) => ({
        ...rest,
        bullets: parseJsonArray(bullets),
      })),
    })),
    null,
    2,
  );
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
              <Text as="h2" variant="headingSm">Connection check (last 48 hours)</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Every call Shopify's post-purchase page makes to this app. No calls after real card orders means Shopify isn't
                running the page at all (app access or the Settings → Checkout choice); non-200 statuses mean it runs but our server
                refuses it.
              </Text>
              {callGroups.length === 0 ? (
                <Text as="p" fontWeight="semibold">No calls yet.</Text>
              ) : (
                <List>
                  {callGroups.map((g) => (
                    <List.Item key={g.path + g.status}>
                      {`${g.path} · status ${g.status} · ${g._count._all} calls · last ${g._max.createdAt ? new Date(g._max.createdAt).toLocaleString() : "—"}`}
                    </List.Item>
                  ))}
                </List>
              )}
              {recentCalls.length > 0 && (
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">Latest calls</Text>
                  {recentCalls.map((c, i) => (
                    <Text as="p" variant="bodySm" key={i}>
                      {`${new Date(c.createdAt).toLocaleString()} · ${c.method} ${c.path} · ${c.status}${c.detail ? ` · ${c.detail}` : ""}`}
                    </Text>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">“Add to my next box” subscriptions (last 30 days)</Text>
              {!rechargeReady && (
                <Banner tone="warning">
                  RECHARGE_API_TOKEN isn't set on the server, so accepted offers wait in the queue until it is.
                </Banner>
              )}
              <Text as="p" variant="bodySm" tone="subdued">
                Accepted offers are added to the customer's Recharge subscriptions within a few minutes, on the same date as
                their next box, then moved to the recurring price after the first delivery is charged.
              </Text>
              <InlineStack gap="300">
                {["pending", "created", "done", "skipped", "failed"].map((k) => (
                  <Badge key={k} tone={k === "failed" ? "critical" : k === "done" || k === "created" ? "success" : undefined}>
                    {`${k}: ${nextBox.counts[k] || 0}`}
                  </Badge>
                ))}
              </InlineStack>
              {nextBox.recent.map((r) => (
                <Text as="p" variant="bodySm" key={r.id}>
                  {`${new Date(r.createdAt).toLocaleString()} · ${r.status}${r.customerId ? ` · customer ${r.customerId}` : ""}${r.detail ? ` · ${r.detail}` : ""}`}
                </Text>
              ))}
            </BlockStack>
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
        <Layout.Section>
          <ImportExportCard
            what="funnels"
            exportJson={exportJson}
            error={importResult?.error || importResult?.message || null}
            onImport={(text) => {
              const fd = new FormData();
              fd.append("intent", "import");
              fd.append("payload", text);
              submit(fd, { method: "post" });
            }}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
