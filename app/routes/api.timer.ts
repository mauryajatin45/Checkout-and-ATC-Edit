import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  if (!shopDomain) {
    return json({ error: "Missing shop parameter" }, { status: 400 });
  }

  const store = await prisma.store.findUnique({
    where: { shopDomain },
    include: { checkoutTimer: true },
  });

  if (!store || !store.checkoutTimer) {
    // Return defaults if not found
    return json({
      settings: {
        enabled: true,
        text: "Due to high demand your order is reserved for:",
        timerMinutes: 10,
        backgroundColor: "#e8f8e8",
        textColor: "#000000",
        iconEnabled: true,
      }
    });
  }

  return json({ settings: store.checkoutTimer });
};
