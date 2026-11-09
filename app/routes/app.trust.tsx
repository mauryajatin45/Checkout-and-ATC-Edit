import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getTrustBlock, saveTrustBlock } from "../models/trustBlock.server";
import { DEFAULT_TRUST_ITEMS, MAX_TRUST_ITEMS, iconSource, parseTrustItems, type TrustItem } from "../lib/trustBlock.shared";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const block = await getTrustBlock(session.shop);
  return json({
    saved: !!block,
    enabled: block ? block.enabled : true,
    title: block?.title || "",
    // Not saved yet: start from what the Checkout Blocks block showed, so switching over is one click.
    items: block ? parseTrustItems(block.items) : DEFAULT_TRUST_ITEMS,
    shop: session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    const items = JSON.parse(String(form.get("items") || "[]"));
    await saveTrustBlock(session.shop, {
      enabled: form.get("enabled") === "true",
      title: String(form.get("title") || ""),
      items,
    });
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err?.message || "Could not save" }, { status: 500 });
  }
};

export default function TrustBlockPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const submit = useSubmit();
  const saving = useNavigation().state === "submitting";
  const [enabled, setEnabled] = useState(data.enabled);
  const [title, setTitle] = useState(data.title);
  const [items, setItems] = useState<TrustItem[]>(data.items);

  useEffect(() => {
    if (actionData?.ok) (window as any).shopify?.toast?.show?.("Trust badges saved");
  }, [actionData]);

  const update = (i: number, patch: Partial<TrustItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  const save = () => {
    const fd = new FormData();
    fd.append("enabled", String(enabled));
    fd.append("title", title);
    fd.append("items", JSON.stringify(items));
    submit(fd, { method: "post" });
  };
  const storeHandle = data.shop.replace(".myshopify.com", "");

  return (
    <Page
      title="Trust Badges"
      titleMetadata={<Badge tone={enabled && data.saved ? "success" : undefined}>{enabled && data.saved ? "Live" : "Off"}</Badge>}
      subtitle="Short reassurance lines in checkout: reviews, testing, cancel anytime."
      primaryAction={{ content: "Save", onAction: save, loading: saving }}
    >
      <TitleBar title="Trust Badges" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {!data.saved && (
              <Banner tone="info" title="Not saved yet">
                The badges below are what the Checkout Blocks “Checkout Trust &amp; Guarantee” block shows today. Save, then in
                the checkout editor add the “Trust Badges” block where that one is and remove the Checkout Blocks block.
              </Banner>
            )}
            {actionData?.error && <Banner tone="critical">{actionData.error}</Banner>}
            <Card>
              <BlockStack gap="300">
                <Checkbox label="Show in checkout" checked={enabled} onChange={setEnabled} />
                <TextField label="Heading (optional)" value={title} onChange={setTitle} autoComplete="off" />
                <InlineStack>
                  <Button url={`https://admin.shopify.com/store/${storeHandle}/settings/checkout/editor`} target="_blank">
                    Open checkout editor
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
            {items.map((it, i) => (
              <Card key={i}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">Badge {i + 1}</Text>
                    <InlineStack gap="100">
                      <Button size="micro" disabled={i === 0} onClick={() => move(i, -1)}>Up</Button>
                      <Button size="micro" disabled={i === items.length - 1} onClick={() => move(i, 1)}>Down</Button>
                      <Button size="micro" tone="critical" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</Button>
                    </InlineStack>
                  </InlineStack>
                  <TextField label="Title" value={it.title} onChange={(v) => update(i, { title: v })} autoComplete="off" />
                  <TextField label="Line" value={it.description} onChange={(v) => update(i, { description: v })} multiline={2} autoComplete="off" />
                  <TextField
                    label="Icon"
                    value={it.icon}
                    onChange={(v) => update(i, { icon: v })}
                    multiline={3}
                    autoComplete="off"
                    helpText="Paste SVG code, or an https:// image URL (square, about 40×40)."
                  />
                </BlockStack>
              </Card>
            ))}
            {items.length < MAX_TRUST_ITEMS && (
              <InlineStack>
                <Button onClick={() => setItems([...items, { icon: "", title: "", description: "" }])}>Add badge</Button>
              </InlineStack>
            )}
          </BlockStack>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Preview</Text>
              <Box borderWidth="025" borderColor="border" borderRadius="300" padding="300">
                <BlockStack gap="300">
                  {title && <Text as="p" fontWeight="semibold">{title}</Text>}
                  {items.map((it, i) => (
                    <InlineGrid key={i} columns="40px 1fr" gap="300" alignItems="center">
                      {iconSource(it.icon) ? <img src={iconSource(it.icon)} width={36} height={36} alt="" /> : <span />}
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">{it.title}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{it.description}</Text>
                      </BlockStack>
                    </InlineGrid>
                  ))}
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
