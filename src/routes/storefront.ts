import { Hono } from "hono";
import { parseVersion } from "../data/version-compat";
import { getAllCosmetics } from "../data/cosmetics";

const app = new Hono();

function makeOfferId(templateId: string): string {
  let hash = 0;
  for (let i = 0; i < templateId.length; i++) {
    hash = ((hash << 5) - hash) + templateId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(32, "0");
}

function buildCatalog() {
  const cosmetics = getAllCosmetics();
  return {
    storefront: {
      name: "BR",
      catalogEntries: cosmetics.map((c) => ({
        offerId: makeOfferId(c.templateId),
        offerType: "StaticStorefront",
        itemGrants: [{ templateId: c.templateId, quantity: 1 }],
        title: c.name,
        description: `${c.rarity} ${c.type}`,
        metaInfo: { SectionId: "Featured", bHideFromStorefront: false },
        bannerOverride: "",
        wearable: true,
        prices: { regularPrice: 0, originalPrice: 0, discount: 0, currencyType: "MtxCurrency", currencySubType: "Currency", dynamicBudgetNS: 0, dynamicBudgetMS: 0, appStoreId: "", vBucksPrice: 0 },
      })),
    },
  };
}

app.get("/fortnite/api/storefront/v2/catalog", (c) => c.json(buildCatalog()));

app.get("/fortnite/api/storefront/v2/keychain", (c) => c.json({ keychain: [] }));

app.get("/fortnite/api/storefront/v2/:affilateName", (c) => c.json({ displayName: c.req.param("affilateName"), id: "affiliate_default", status: "ACTIVE", name: "Default" }));

export default app;
