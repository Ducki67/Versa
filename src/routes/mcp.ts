import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { store } from "../storage/store";
import { errorResponse } from "../utils/error";
import { makeID, timeAsISO } from "../utils/funcs";
import { parseVersion, shouldForceBRMode, supportsNewMCPFormat, getMCPResponseVersion, getSeasonFromBuild } from "../data/version-compat";
import { ALL_SKINS, ALL_BACK_BLINGS, ALL_PICKAXES, ALL_GLIDERS, ALL_CONTRAILS, ALL_EMOTES, ALL_LOADING_SCREENS, ALL_MUSIC_PACKS, ALL_WRAPS, ALL_SPRAYS, ALL_TOYS, ALL_PET_CODES, ALL_BANNERS, CosmeticDef } from "../data/cosmetics";
import { ProfileChange, MCPResponse } from "../types";

const app = new Hono();

function buildMCPResponse(profileId: string, rvn: number, cmdRev: number, changes: ProfileChange[], responseVersion: number = 1): Record<string, unknown> {
  return {
    profileRevision: rvn,
    profileId,
    profileChangesBaseRevision: rvn,
    profileChanges: changes,
    profileCommandRevision: cmdRev,
    serverTime: timeAsISO(),
    multiUpdate: [],
    notifications: [],
    responseVersion,
  };
}

function buildProfileObject(
  accountId: string,
  profileId: string,
  data: Record<string, unknown>,
  rvn: number,
  cmdRev: number
): Record<string, unknown> {
  const now = timeAsISO();
  return {
    _id: `${accountId}_${profileId}`,
    created: (data.created as string) || now,
    updated: now,
    rvn,
    wipeNumber: (data.wipeNumber as number) ?? 1,
    accountId,
    profileId,
    version: (data.version as string) || "versa_v1",
    items: (data.items as Record<string, unknown>) || {},
    stats: (data.stats as Record<string, unknown>) || { attributes: {} },
    commandRevision: cmdRev,
  };
}

function addToItems(items: Record<string, Record<string, unknown>>, defs: CosmeticDef[], attributes: Record<string, unknown> = {}) {
  for (const def of defs) {
    items[def.templateId] = {
      templateId: def.templateId,
      attributes: { ...attributes },
      quantity: 1,
    };
  }
}

function getFullLockerItems(): Record<string, Record<string, unknown>> {
  const items: Record<string, Record<string, unknown>> = {};
  addToItems(items, ALL_SKINS);
  addToItems(items, ALL_BACK_BLINGS);
  addToItems(items, ALL_PICKAXES);
  addToItems(items, ALL_GLIDERS);
  addToItems(items, ALL_CONTRAILS);
  addToItems(items, ALL_EMOTES);
  addToItems(items, ALL_LOADING_SCREENS);
  addToItems(items, ALL_MUSIC_PACKS);
  addToItems(items, ALL_WRAPS);
  addToItems(items, ALL_SPRAYS);
  addToItems(items, ALL_TOYS);
  addToItems(items, ALL_PET_CODES);
  addToItems(items, ALL_BANNERS);
  return items;
}

function getDefaultAthenaData(season: number = 1): Record<string, unknown> {
  return {
    items: getFullLockerItems(),
    stats: {
      attributes: {
        season_num: season,
        season_update: 0,
        book_level: 1,
        book_xp: 0,
        book_purchased: false,
        level: 1,
        xp: 0,
        accountLevel: 1,
        lifetime_wins: 0,
        battlestars: 0,
        battlestars_season_total: 0,
        style_points: 0,
        purchased_bp_offers: [],
        rested_xp: 0,
        rested_xp_mult: 1,
        rested_xp_overflow: 0,
        rested_xp_exchange: 1,
        rested_xp_cumulative: 0,
        favorite_character: "",
        favorite_backpack: "",
        favorite_pickaxe: "",
        favorite_glider: "",
        favorite_skydivecontrail: "",
        favorite_musicpack: "",
        favorite_loadingscreen: "",
        favorite_hat: "",
        favorite_victorypose: "",
        favorite_consumableemote: "",
        favorite_callingcard: "",
        favorite_spray: ["", "", "", "", "", ""],
        favorite_dance: ["", "", "", "", "", ""],
        favorite_itemwraps: ["", "", "", "", "", "", ""],
        banner_icon: "standardbanner15",
        banner_color: "defaultcolor15",
        mfa_reward_claimed: false,
        quest_manager: {
          dailyLoginInterval: "0001-01-01T00:00:00.000Z",
          dailyQuestRerolls: 1,
          questPoolStats: {},
        },
        daily_rewards: {},
        past_seasons: [],
        season_match_boost: 0,
        season_friend_match_boost: 0,
        inventory_limit_bonus: 0,
        last_applied_loadout: "",
        active_loadout_index: 0,
        loadouts: [],
        loadout_presets: {},
      },
    },
  };
}

function getDefaultCommonCoreData(): Record<string, unknown> {
  return {
    items: {
      "Currency:MtxPurchased": { templateId: "Currency:MtxPurchased", attributes: { platform: "EpicPC" }, quantity: 100000 },
      "Currency:MtxGiveaway": { templateId: "Currency:MtxGiveaway", attributes: {}, quantity: 0 },
    },
    stats: {
      attributes: {
        current_mtx_platform: "EpicPC",
        mtx_purchase_history: {},
        daily_purchases: {},
        fn_app_version: "",
        current_mtx_currency: "MtxPurchased",
      },
    },
  };
}

function getDefaultCampaignData(): Record<string, unknown> {
  return {
    items: {},
    stats: {
      attributes: {
        quest_manager: {},
        world_results: [],
      },
    },
  };
}

function getDefaultCommonPublicData(): Record<string, unknown> {
  return {
    items: {},
    stats: {
      attributes: {
        skydive_contrail: "",
      },
    },
  };
}

function getDefaultMetadataData(): Record<string, unknown> {
  return {
    items: {},
    stats: {
      attributes: {},
    },
  };
}

function getOrCreateProfile(accountId: string, profileId: string, version?: ReturnType<typeof parseVersion>): { data: Record<string, unknown>; rvn: number; cmdRev: number } {
  const build = version?.build || 999;
  let profile = store.getProfile(accountId, profileId);
  if (!profile) {
    let defaultData: Record<string, unknown> | null = null;
    switch (profileId) {
      case "athena": defaultData = getDefaultAthenaData(version?.season ?? getSeasonFromBuild(build)); break;
      case "common_core": defaultData = getDefaultCommonCoreData(); break;
      case "common_public": defaultData = getDefaultCommonPublicData(); break;
      case "campaign": defaultData = getDefaultCampaignData(); break;
      case "metadata": defaultData = getDefaultMetadataData(); break;
      case "creative": defaultData = { items: {}, stats: { attributes: {} } }; break;
      default: defaultData = { items: {}, stats: { attributes: {} } };
    }
    profile = { accountId, profileId, rvn: 1, commandRevision: 0, data: defaultData };
    store.saveProfile(profile);
  }
  return { data: profile.data, rvn: profile.rvn, cmdRev: profile.commandRevision };
}

function saveProfile(accountId: string, profileId: string, data: Record<string, unknown>, rvn: number, cmdRev: number) {
  store.saveProfile({ accountId, profileId, rvn, commandRevision: cmdRev, data });
}

app.post("/fortnite/api/game/v2/profile/:accountId/client/:operation", async (c) => {
  const accountId = c.req.param("accountId");
  const operation = c.req.param("operation");
  const profileId = c.req.query("profileId") || "athena";
  const rvnParam = parseInt(c.req.query("rvn") || "-1");
  const version = c.get("version") as ReturnType<typeof parseVersion>;

  const { data, rvn, cmdRev } = getOrCreateProfile(accountId, profileId, version);
  const dataAny = data as any;
  const changes: ProfileChange[] = [];
  let newRvn = rvn;
  let newCmdRev = cmdRev;

  switch (operation) {
    case "QueryProfile": {
      if (rvnParam < 0 || rvnParam < rvn) {
        changes.push({
          changeType: "fullProfileUpdate",
          profile: buildProfileObject(accountId, profileId, data, rvn, cmdRev),
        });
      }
      break;
    }
    case "MarkItemSeen": {
      const body = await c.req.json().catch(() => ({}));
      const itemIds = (body as Record<string, unknown>).itemIds as string[] || [];
      newRvn++; newCmdRev++;
      const items = dataAny.items as Record<string, Record<string, unknown>> || {};
      for (const id of itemIds) {
        if (items[id]) { items[id].attributes = { ...(items[id].attributes as Record<string, unknown>), seen: true }; changes.push({ changeType: "itemAttrChanged", itemId: id, attributeName: "seen", attributeValue: true }); }
      }
      break;
    }
    case "SetItemFavoriteStatusBatch": {
      const body = await c.req.json().catch(() => ({}));
      const itemIds = (body as Record<string, unknown>).itemIds as string[] || [];
      const status = (body as Record<string, unknown>).status as boolean || false;
      newRvn++; newCmdRev++;
      const items = dataAny.items as Record<string, Record<string, unknown>> || {};
      for (const id of itemIds) {
        if (items[id]) { items[id].attributes = { ...(items[id].attributes as Record<string, unknown>), favorite: status }; changes.push({ changeType: "itemAttrChanged", itemId: id, attributeName: "favorite", attributeValue: status }); }
      }
      break;
    }
    case "SetItemFavoriteStatus": {
      const body = await c.req.json().catch(() => ({}));
      const b = body as Record<string, unknown>;
      newRvn++; newCmdRev++;
      const items = dataAny.items as Record<string, Record<string, unknown>> || {};
      const itemId = b.itemId as string;
      const fav = b.itemToFavStatus as boolean || false;
      if (items[itemId]) { items[itemId].attributes = { ...(items[itemId].attributes as Record<string, unknown>), favorite: fav }; changes.push({ changeType: "itemAttrChanged", itemId, attributeName: "favorite", attributeValue: fav }); }
      break;
    }
    case "SetCosmeticLockerSlot": {
      const body = await c.req.json().catch(() => ({}));
      const b = body as Record<string, unknown>;
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "lockerSlot", attributeValue: { slotIndex: b.slotIndex, itemId: b.itemId, variantOptions: b.variantOptions || [] } });
      break;
    }
    case "SetCosmeticLockerBanner": {
      const body = await c.req.json().catch(() => ({}));
      const b = body as Record<string, unknown>;
      newRvn++; newCmdRev++;
      const attrs = (dataAny.stats?.attributes as Record<string, unknown>) || {};
      attrs.banner_icon = b.bannerIcon || "DefaultBanner";
      attrs.banner_color = b.bannerColor || "DefaultColor";
      changes.push({ changeType: "statModified", attributeName: "banner_icon", attributeValue: attrs.banner_icon });
      changes.push({ changeType: "statModified", attributeName: "banner_color", attributeValue: attrs.banner_color });
      break;
    }
    case "SetCosmeticLockerName": {
      const body = await c.req.json().catch(() => ({}));
      const b = body as Record<string, unknown>;
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "lockerName", attributeValue: b.name || "Locker" });
      break;
    }
    case "DeleteCosmeticLoadout": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "deletedLoadout", attributeValue: makeID() });
      break;
    }
    case "CopyCosmeticLoadout": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "copiedLoadout", attributeValue: makeID() });
      break;
    }
    case "SetRandomCosmeticLoadoutFlag": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "randomCosmeticLoadout", attributeValue: true });
      break;
    }
    case "EquipBattleRoyaleCustomization": {
      const body = await c.req.json().catch(() => ({}));
      const b = body as Record<string, unknown>;
      newRvn++; newCmdRev++;
      const slotName = (b.slotName as string) || "character";
      changes.push({ changeType: "statModified", attributeName: `cosmeticLockerSlot_${slotName}`, attributeValue: { slotName, itemToSlot: b.itemToSlot || "", variantJobs: b.variantUpdates || [] } });
      break;
    }
    case "BulkEquipBattleRoyaleCustomization": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "bulkEquip", attributeValue: timeAsISO() });
      break;
    }
    case "SetMtxPlatform": {
      newRvn++; newCmdRev++;
      const attrs = (dataAny.stats?.attributes as Record<string, unknown>) || {};
      attrs.current_mtx_platform = "EpicPC";
      changes.push({ changeType: "statModified", attributeName: "current_mtx_platform", attributeValue: "EpicPC" });
      break;
    }
    case "SetAffiliateName": {
      const body = await c.req.json().catch(() => ({}));
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "currentAffiliate", attributeValue: (body as Record<string, unknown>).affiliateName || "" });
      break;
    }
    case "SetHomebaseName": {
      const body = await c.req.json().catch(() => ({}));
      newRvn++; newCmdRev++;
      const attrs = (dataAny.stats?.attributes as Record<string, unknown>) || {};
      attrs.homebase_name = (body as Record<string, unknown>).homebaseName || "Homebase";
      changes.push({ changeType: "statModified", attributeName: "homebase_name", attributeValue: attrs.homebase_name });
      break;
    }
    case "PurchaseCatalogEntry": {
      const body = await c.req.json().catch(() => ({}));
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "lastPurchase", attributeValue: { offerId: (body as Record<string, unknown>).offerId || makeID(), purchaseTime: timeAsISO() } });
      break;
    }
    case "RefundMtxPurchase": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "lastRefund", attributeValue: timeAsISO() });
      break;
    }
    case "RemoveGiftBox": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "giftBoxRemoved", attributeValue: timeAsISO() });
      break;
    }
    case "ClientQuestLogin": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "questLogin", attributeValue: timeAsISO() });
      break;
    }
    case "RefreshExpeditions": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "expeditionRefresh", attributeValue: timeAsISO() });
      break;
    }
    case "GetMcpTimeForLogin": {
      break;
    }
    case "IncrementNamedCounterStat": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "counterIncrement", attributeValue: timeAsISO() });
      break;
    }
    case "SetHardcoreModifier": {
      const body = await c.req.json().catch(() => ({}));
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "hardcoreModifier", attributeValue: (body as Record<string, unknown>).modifier || 0 });
      break;
    }
    case "SetPartyAssistQuest": {
      const body = await c.req.json().catch(() => ({}));
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "partyAssistQuest", attributeValue: (body as Record<string, unknown>).questId || "" });
      break;
    }
    case "AthenaPinQuest": {
      const body = await c.req.json().catch(() => ({}));
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "pinnedQuest", attributeValue: (body as Record<string, unknown>).questId || "" });
      break;
    }
    case "SetPinnedQuests": {
      const body = await c.req.json().catch(() => ({}));
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "pinnedQuests", attributeValue: (body as Record<string, unknown>).questIds || [] });
      break;
    }
    case "FortRerollDailyQuest": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "rerolledQuest", attributeValue: timeAsISO() });
      break;
    }
    case "MarkNewQuestNotificationSent": {
      newRvn++; newCmdRev++;
      changes.push({ changeType: "statModified", attributeName: "newQuestNotificationSent", attributeValue: timeAsISO() });
      break;
    }
    default: {
      return c.json(errorResponse("com.epicgames.fortnite", "errors.com.epicgames.fortnite.operation_not_found", `Operation '${operation}' not found`), 400);
    }
  }

  if (changes.length > 0) saveProfile(accountId, profileId, data, newRvn, newCmdRev);

  const respVersion = getMCPResponseVersion(version?.build || 999);
  return c.json(buildMCPResponse(profileId, newRvn, newCmdRev, changes, respVersion));
});

export default app;
