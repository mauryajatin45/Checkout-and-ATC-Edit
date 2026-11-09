import { useState } from "react";
import { BlockStack, Button, Card, InlineStack, Text, TextField } from "@shopify/polaris";

/**
 * Advanced: settings as JSON, to back them up, copy them to another store, or edit many at once.
 * "Export" fills the box with the current settings; "Import" saves what's in the box (items with an
 * existing id are updated, the rest are created).
 */
export function ImportExportCard(props: { what: string; exportJson: string; onImport: (json: string) => void; busy?: boolean; error?: string | null }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingSm">{`Import / export ${props.what} (JSON)`}</Text>
          <Button variant="plain" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</Button>
        </InlineStack>
        {open && (
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">
              For backups, copying to another store, or editing many at once. Entries with an existing “id” are updated,
              entries without one are created. Leave out an entry to keep it as it is.
            </Text>
            <TextField label="JSON" labelHidden value={text} onChange={setText} multiline={10} autoComplete="off" monospaced />
            {props.error && <Text as="p" tone="critical">{props.error}</Text>}
            <InlineStack gap="200">
              <Button onClick={() => setText(props.exportJson)}>Export current</Button>
              <Button variant="primary" loading={props.busy} disabled={!text.trim()} onClick={() => props.onImport(text)}>
                Import
              </Button>
            </InlineStack>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
