import { createHash } from "crypto";
import { getAllCosmetics, type CosmeticDef } from "../data/cosmetics";

const CATALOG_NAMESPACE = "versa.catalog.v1";
const CATALOG_START = "2024-01-01T00:00:00.000Z";
const CATALOG_END = "2099-12-31T23:59:59.999Z";
const STOREFRONT_ORDER = [
  "BRFeaturedStorefront",
  "BRDailyStorefront",
  "BRSpecialStorefront",
] as const;

type StorefrontName = (typeof STOREFRONT_ORDER)[number];

export interface CatalogPrice {
  currencyType: string;
  currencySubType: string;
  regularPrice: number;
  dynamicPrice: number;
  finalPrice: number;
  basePrice: number;
  saleType: string;
}

export interface CatalogItemGrant {
  templateId: string;
  quantity: number;
}

export interface CatalogEntry {
  offerId: string;
  devName: string;
  offerType: string;
  fulfillmentIds: string[];
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  categories: string[];
  prices: CatalogPrice[];
  itemGrants: CatalogItemGrant[];
  requirements: unknown[];
  metaInfo: Array<{ key: string; value: string }>;
  displayAssetPath: string;
  refundable: boolean;
  giftInfo: {
    bIsEnabled: boolean;
    forcedGiftBoxTemplateId: string;
    purchaseRequirements: unknown[];
    giftRecordIds: string[];
  };
  sortPriority: number;
  catalogGroup: string;
  appStoreId: string;
  bannerOverride: string;
  title: string;
  description: string;
  activationDate: string;
  expirationDate: string;
}

export interface CatalogStorefront {
  name: StorefrontName;
  catalogEntries: CatalogEntry[];
}

export interface CatalogResponse {
  refreshIntervalHrs: number;
  dailyPurchaseHrs: number;
  expiration: string;
  catalogId: string;
  catalogVersion: string;
  storefronts: CatalogStorefront[];
}

export interface CatalogOffer {
  offerId: string;
  storefront: StorefrontName;
  cosmetic: CosmeticDef;
  entry: CatalogEntry;
}

export interface CatalogSummary {
  catalogId: string;
  activationDate: string;
  expirationDate: string;
  storefronts: Array<{ name: StorefrontName; itemCount: number }>;
}

interface CatalogRecord {
  offerId: string;
  storefront: StorefrontName;
  cosmetic: CosmeticDef;
  sortPriority: number;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function offerIdFor(templateId: string): string {
  return fingerprint(`${CATALOG_NAMESPACE}:offer:${templateId}`).slice(0, 32);
}

function cloneCosmetic(cosmetic: CosmeticDef): CosmeticDef {
  return {
    ...cosmetic,
    genAddons: cosmetic.genAddons ? [...cosmetic.genAddons] : undefined,
  };
}

function storefrontFor(cosmetic: CosmeticDef): StorefrontName {
  if (cosmetic.type === "Banner" || cosmetic.type === "Pet" || cosmetic.type === "LoadingScreen") {
    return "BRSpecialStorefront";
  }

  if (cosmetic.rarity === "EFortRarity::Epic" || cosmetic.rarity === "EFortRarity::Legendary") {
    return "BRFeaturedStorefront";
  }

  return "BRDailyStorefront";
}

function sectionFor(storefront: StorefrontName): string {
  switch (storefront) {
    case "BRFeaturedStorefront":
      return "Featured";
    case "BRSpecialStorefront":
      return "Special";
    default:
      return "Daily";
  }
}

function categoryFor(cosmetic: CosmeticDef): string {
  return cosmetic.type === "BackBling" ? "BackAccessory" : cosmetic.type;
}

const cosmeticsByTemplateId = new Map<string, CosmeticDef>();
for (const cosmetic of getAllCosmetics()) {
  if (!cosmeticsByTemplateId.has(cosmetic.templateId)) {
    cosmeticsByTemplateId.set(cosmetic.templateId, cosmetic);
  }
}

const records: CatalogRecord[] = [...cosmeticsByTemplateId.values()]
  .sort((left, right) => left.templateId.localeCompare(right.templateId))
  .map((cosmetic, sortPriority) => ({
    offerId: offerIdFor(cosmetic.templateId),
    storefront: storefrontFor(cosmetic),
    cosmetic: cloneCosmetic(cosmetic),
    sortPriority,
  }));

const recordsByOfferId = new Map(records.map((record) => [record.offerId, record]));
const recordsByTemplateId = new Map(records.map((record) => [record.cosmetic.templateId, record]));
const CATALOG_ID = fingerprint(
  `${CATALOG_NAMESPACE}:catalog:${records.map((record) => record.cosmetic.templateId).join("|")}`
).slice(0, 32);

function entryFor(record: CatalogRecord): CatalogEntry {
  const section = sectionFor(record.storefront);
  const cosmetic = record.cosmetic;
  return {
    offerId: record.offerId,
    devName: `${cosmetic.name} (${cosmetic.type})`,
    offerType: "StaticPrice",
    fulfillmentIds: [],
    dailyLimit: -1,
    weeklyLimit: -1,
    monthlyLimit: -1,
    categories: [section, categoryFor(cosmetic)],
    prices: [
      {
        currencyType: "MtxCurrency",
        currencySubType: "Currency",
        regularPrice: 0,
        dynamicPrice: 0,
        finalPrice: 0,
        basePrice: 0,
        saleType: "NotOnSale",
      },
    ],
    itemGrants: [{ templateId: cosmetic.templateId, quantity: 1 }],
    requirements: [],
    metaInfo: [
      { key: "SectionId", value: section },
      { key: "CosmeticType", value: cosmetic.type },
      { key: "Rarity", value: cosmetic.rarity },
      { key: "CatalogId", value: CATALOG_ID },
    ],
    displayAssetPath: "",
    refundable: false,
    giftInfo: {
      bIsEnabled: true,
      forcedGiftBoxTemplateId: "",
      purchaseRequirements: [],
      giftRecordIds: [],
    },
    sortPriority: record.sortPriority,
    catalogGroup: "BR",
    appStoreId: "",
    bannerOverride: "",
    title: cosmetic.name,
    description: `${cosmetic.rarity.replace("EFortRarity::", "")} ${cosmetic.type}`,
    activationDate: CATALOG_START,
    expirationDate: CATALOG_END,
  };
}

function offerFor(record: CatalogRecord): CatalogOffer {
  return {
    offerId: record.offerId,
    storefront: record.storefront,
    cosmetic: cloneCosmetic(record.cosmetic),
    entry: entryFor(record),
  };
}

export function getCatalogOfferId(templateId: string): string | null {
  return recordsByTemplateId.get(templateId)?.offerId ?? null;
}

export function getCatalogOffer(offerId: string): CatalogOffer | null {
  const record = recordsByOfferId.get(offerId);
  return record ? offerFor(record) : null;
}

export function getCatalogOfferByTemplateId(templateId: string): CatalogOffer | null {
  const record = recordsByTemplateId.get(templateId);
  return record ? offerFor(record) : null;
}

export function getCatalogOffers(): CatalogOffer[] {
  return records.map(offerFor);
}

export function buildCatalogResponse(): CatalogResponse {
  const storefronts = STOREFRONT_ORDER.map((name) => ({
    name,
    catalogEntries: records
      .filter((record) => record.storefront === name)
      .map(entryFor),
  }));

  return {
    refreshIntervalHrs: 24,
    dailyPurchaseHrs: 24,
    expiration: CATALOG_END,
    catalogId: CATALOG_ID,
    catalogVersion: "1",
    storefronts,
  };
}

export function getCatalogWindow(): { activationDate: string; expirationDate: string; catalogId: string } {
  return {
    activationDate: CATALOG_START,
    expirationDate: CATALOG_END,
    catalogId: CATALOG_ID,
  };
}

export function getCatalogSummary(): CatalogSummary {
  return {
    catalogId: CATALOG_ID,
    activationDate: CATALOG_START,
    expirationDate: CATALOG_END,
    storefronts: STOREFRONT_ORDER.map((name) => ({
      name,
      itemCount: records.filter((record) => record.storefront === name).length,
    })),
  };
}
