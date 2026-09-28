import { Hono } from "hono";
import { buildCatalogResponse, getCatalogWindow, getCatalogOfferId } from "../services/catalog";

const app = new Hono();

app.get("/fortnite/api/storefront/v2/catalog", (c) => c.json(buildCatalogResponse()));

app.get("/fortnite/api/storefront/v2/keychain", (c) => c.json({
  keychain: [
    {
      type: "basic",
      certificate: "",
      key: "",
    },
  ],
}));

app.get("/fortnite/api/storefront/v2/:affiliateName", (c) => {
  const window = getCatalogWindow();
  return c.json({
    displayName: c.req.param("affiliateName"),
    id: "affiliate_default",
    status: "ACTIVE",
    name: "Default",
    catalogId: window.catalogId,
    activationDate: window.activationDate,
    expirationDate: window.expirationDate,
  });
});

app.get("/fortnite/api/storefront/v2/:affiliateName/search", (c) => {
  const query = c.req.query("search") || "";
  const catalog = buildCatalogResponse();
  const filtered = catalog.storefronts.flatMap((s) => s.catalogEntries.filter((e) => e.title.toLowerCase().includes(query.toLowerCase())));
  return c.json({
    searchResults: filtered,
    totalResults: filtered.length,
  });
});

app.get("/fortnite/api/storefront/v2/:affiliateName/offers/:offerId", (c) => {
  const offerId = c.req.param("offerId");
  const catalog = buildCatalogResponse();
  for (const storefront of catalog.storefronts) {
    for (const entry of storefront.catalogEntries) {
      if (entry.offerId === offerId) {
        return c.json(entry);
      }
    }
  }
  return c.json({ error: "Offer not found" }, 404);
});

app.post("/fortnite/api/storefront/v2/:affiliateName/purchase", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const offerId = body.offerId || "";
  const purchaseQuantity = body.purchaseQuantity || 1;
  const catalog = buildCatalogResponse();
  return c.json({
    purchase: {
      offerId,
      purchaseQuantity,
      status: "SUCCESS",
      transactionId: Date.now().toString(),
    },
  });
});

export default app;