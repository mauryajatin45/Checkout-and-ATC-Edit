import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Link, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  InlineStack,
  EmptyState,
  Box,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getUpsellCampaigns,
  deleteUpsellCampaign,
  toggleUpsellCampaign,
} from "../models/checkoutUpsell.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const campaigns = await getUpsellCampaigns(session.shop);
  return json({ campaigns });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  const id = formData.get("id") as string;

  if (!id) {
    return json({ error: "Missing campaign id" }, { status: 400 });
  }

  try {
    if (actionType === "delete") {
      await deleteUpsellCampaign(session.shop, id);
      return json({ success: true, message: "Campaign deleted" });
    } else if (actionType === "toggle") {
      const enabled = formData.get("enabled") === "true";
      await toggleUpsellCampaign(session.shop, id, enabled);
      return json({ success: true, message: "Status updated" });
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};

export default function UpsellsIndex() {
  const { campaigns } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();

  const handleToggle = (id: string, currentEnabled: boolean) => {
    const formData = new FormData();
    formData.append("action", "toggle");
    formData.append("id", id);
    formData.append("enabled", String(!currentEnabled));
    submit(formData, { method: "post" });
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete campaign "${name}"?`)) {
      const formData = new FormData();
      formData.append("action", "delete");
      formData.append("id", id);
      submit(formData, { method: "post" });
    }
  };

  const resourceName = {
    singular: "upsell campaign",
    plural: "upsell campaigns",
  };

  const rowMarkup = campaigns.map(
    ({ id, name, enabled, sourcePage, headline, items, priority }, index) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            <Link to={`/app/upsells/${id}`} style={{ textDecoration: "none", color: "inherit" }}>
              {name}
            </Link>
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={enabled ? "success" : "subdued"}>
            {enabled ? "Active" : "Inactive"}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            <code>{sourcePage || "* (All pages)"}</code>
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued" as="span" truncate>
            {headline || "No headline set"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone="info">{`${items.length} product${items.length === 1 ? "" : "s"}`}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" align="end">
            <Button
              size="micro"
              variant={enabled ? "secondary" : "primary"}
              onClick={() => handleToggle(id, enabled)}
            >
              {enabled ? "Deactivate" : "Activate"}
            </Button>
            <Button
              size="micro"
              onClick={() => navigate(`/app/upsells/${id}`)}
            >
              Edit
            </Button>
            <Button
              size="micro"
              tone="critical"
              onClick={() => handleDelete(id, name)}
            >
              Delete
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <Page
      title="Checkout Upsell Campaigns"
      subtitle="Show targeted upsell products in checkout based on which page the customer came from."
      primaryAction={{
        content: "Create Campaign",
        onAction: () => navigate("/app/upsells/new"),
      }}
    >
      <TitleBar title="Checkout Upsells" />
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {campaigns.length === 0 ? (
              <Box padding="500">
                <EmptyState
                  heading="Create your first checkout upsell"
                  action={{
                    content: "Create Campaign",
                    onAction: () => navigate("/app/upsells/new"),
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Target specific landing pages or product pages to display one-click add-to-cart upsells
                    above the checkout contact section.
                  </p>
                </EmptyState>
              </Box>
            ) : (
              <IndexTable
                resourceName={resourceName}
                itemCount={campaigns.length}
                headings={[
                  { title: "Campaign Name" },
                  { title: "Status" },
                  { title: "Source Page Path" },
                  { title: "Headline" },
                  { title: "Products" },
                  { title: "Actions", alignment: "end" },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
