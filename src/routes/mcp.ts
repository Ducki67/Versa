import { Hono } from "hono";
import { store } from "../storage/store";
import { errorResponse } from "../utils/error";
import { makeID, timeAsISO } from "../utils/funcs";
import { parseVersion, shouldForceBRMode, supportsNewMCPFormat, getMCPResponseVersion, getSeasonFromBuild, getMtxPlatform } from "../data/version-compat";
import { FULL_LOCKER } from "../data/full-locker";
import { getCatalogOffer } from "../services/catalog";
import { ProfileChange } from "../types";

const app = new Hono();

const LOCKER_ID = "sandbox_loadout";
const FULL_LOCKER_COUNT = FULL_LOCKER.length;

function statChange(name: string, value: unknown): ProfileChange {
  return { changeType: "statModified", attributeName: name, attributeValue: value, quantity: 0, items: {}, profile: {} } as unknown as ProfileChange;
}

function toWireChange(change: ProfileChange): Record<string, unknown> {
  const raw = change as unknown as Record<string, unknown>;
  if (raw.changeType === "statModified") {
    const name = (raw.attributeName as string) ?? (raw.name as string) ?? "";
    const value = raw.attributeValue !== undefined ? raw.attributeValue : raw.value;
    return { changeType: "statModified", name, value, attributeName: name, attributeValue: value };
  }
  return raw as Record<string, unknown>;
}

function buildMCPResponse(profileId: string, rvn: number, cmdRev: number, changes: ProfileChange[], multiUpdate: Record<string, unknown>[] = [], notifications: unknown[] = [], responseVersion: number = 1): Record<string, unknown> {
  return { profileRevision: rvn, profileId, profileChangesBaseRevision: rvn, profileChanges: changes.map(toWireChange), profileCommandRevision: cmdRev, serverTime: timeAsISO(), multiUpdate, notifications, responseVersion };
}

function buildProfileObject(accountId: string, profileId: string, data: Record<string, unknown>, rvn: number, cmdRev: number): Record<string, unknown> {
  const now = timeAsISO();
  return { _id: `${accountId}_${profileId}`, created: (data.created as string) || now, updated: now, rvn, wipeNumber: (data.wipeNumber as number) ?? 1, accountId, profileId, version: (data.version as string) || "versa_v1", items: (data.items as Record<string, unknown>) || {}, stats: (data.stats as Record<string, unknown>) || { attributes: {} }, commandRevision: cmdRev };
}

function cosmeticAttributes(variants: Array<{ channel: string; active: string; owned: string[] }> = []): Record<string, unknown> {
  return { max_level_bonus: 0, level: 1, item_seen: true, seen: true, xp: 0, variants, favorite: false };
}

function addFullLocker(items: Record<string, Record<string, unknown>>) {
  for (const def of FULL_LOCKER) {
    items[makeID()] = { templateId: def.templateId, attributes: cosmeticAttributes(def.variants), quantity: 1 };
  }
}

function ensureDefaults(items: Record<string, Record<string, unknown>>) {
  const owned = new Set(Object.values(items).map((i) => String((i as Record<string, unknown>).templateId || "").toLowerCase()));
  const need: Array<{ templateId: string }> = [
    { templateId: "AthenaPickaxe:DefaultPickaxe" },
    { templateId: "AthenaGlider:DefaultGlider" },
    { templateId: "AthenaDance:EID_DanceMoves" },
    { templateId: "AthenaDance:EID_Floss" },
    { templateId: "AthenaCharacter:CID_001_Athena_Commando_F" },
  ];
  for (const n of need) {
    if (!owned.has(n.templateId.toLowerCase())) {
      items[makeID()] = { templateId: n.templateId, attributes: cosmeticAttributes(), quantity: 1 };
    }
  }
}

function defaultLockerSlots(): Record<string, unknown> {
  return {
    slots: {
      Character: { items: [""], activeVariants: [null] },
      Backpack: { items: [""], activeVariants: [null] },
      Pickaxe: { items: ["AthenaPickaxe:DefaultPickaxe"], activeVariants: [null] },
      Glider: { items: ["AthenaGlider:DefaultGlider"], activeVariants: [null] },
      SkyDiveContrail: { items: [""], activeVariants: [null] },
      MusicPack: { items: [""], activeVariants: [null] },
      LoadingScreen: { items: [""], activeVariants: [null] },
      Dance: { items: ["", "", "", "", "", ""] },
      ItemWrap: { items: ["", "", "", "", "", "", ""], activeVariants: [null, null, null, null, null, null, null] },
    },
  };
}

function ensureLocker(items: Record<string, Record<string, unknown>>): Record<string, unknown> {
  let locker = items[LOCKER_ID] as Record<string, unknown> | undefined;
  if (!locker || (locker as Record<string, unknown>).templateId !== "CosmeticLocker:cosmeticlocker_athena") {
    for (const [id, item] of Object.entries(items)) {
      if ((item as Record<string, unknown>).templateId === "CosmeticLocker:cosmeticlocker_athena") {
        if (id !== LOCKER_ID) {
          items[LOCKER_ID] = item;
          delete items[id];
        }
        locker = items[LOCKER_ID] as Record<string, unknown>;
        break;
      }
    }
  }
  if (!locker) {
    locker = {
      templateId: "CosmeticLocker:cosmeticlocker_athena",
      attributes: {
        locker_slots_data: defaultLockerSlots(),
        use_count: 0,
        banner_icon_template: "StandardBanner15",
        banner_color_template: "DefaultColor15",
        locker_name: "Locker",
        item_seen: true,
        seen: true,
        favorite: false,
      },
      quantity: 1,
    };
    items[LOCKER_ID] = locker as Record<string, Record<string, unknown>> as unknown as Record<string, unknown> as never;
  } else {
    const attrs = (locker.attributes as Record<string, unknown>) || {};
    if (!attrs.locker_slots_data) attrs.locker_slots_data = defaultLockerSlots();
    if (attrs.banner_icon_template === undefined) attrs.banner_icon_template = "StandardBanner15";
    if (attrs.banner_color_template === undefined) attrs.banner_color_template = "DefaultColor15";
    if (attrs.locker_name === undefined) attrs.locker_name = "Locker";
    locker.attributes = attrs;
  }
  return locker;
}

function getFullLockerItems(): Record<string, Record<string, unknown>> {
  const items: Record<string, Record<string, unknown>> = {};
  addFullLocker(items);
  ensureDefaults(items);
  ensureLocker(items);
  return items;
}

function getStarterLockerItems(): Record<string, Record<string, unknown>> {
  const items: Record<string, Record<string, unknown>> = {};
  const want = FULL_LOCKER.slice(0, 150);
  for (const def of want) {
    items[makeID()] = { templateId: def.templateId, attributes: cosmeticAttributes(def.variants), quantity: 1 };
  }
  ensureDefaults(items);
  ensureLocker(items);
  return items;
}

function migrateOldItems(items: Record<string, Record<string, unknown>>): boolean {
  let migrated = false;
  const next: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(items)) {
    const templateId = String((value as Record<string, unknown>)?.templateId || "");
    if (templateId && key === templateId) {
      next[makeID()] = value;
      migrated = true;
    } else {
      next[key] = value;
    }
  }
  if (migrated) {
    for (const k of Object.keys(items)) delete items[k];
    for (const [k, v] of Object.entries(next)) items[k] = v;
  }
  return migrated;
}

function getDefaultAthenaData(season: number = 1, legacy: boolean = false): Record<string, unknown> {
  const items = legacy ? getStarterLockerItems() : getFullLockerItems();
  return {
    created: timeAsISO(),
    wipeNumber: 1,
    version: "versa_v1",
    items,
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
        favorite_pickaxe: "AthenaPickaxe:DefaultPickaxe",
        favorite_glider: "AthenaGlider:DefaultGlider",
        favorite_skydivecontrail: "",
        favorite_musicpack: "",
        favorite_loadingscreen: "",
        favorite_hat: "",
        favorite_victorypose: "",
        favorite_consumableemote: "",
        favorite_callingcard: "",
        favorite_battlebus: "",
        favorite_mapmarker: "",
        favorite_vehicledeco: "",
        favorite_spray: [],
        favorite_dance: ["", "", "", "", "", ""],
        favorite_itemwraps: ["", "", "", "", "", "", ""],
        banner_icon: "StandardBanner15",
        banner_color: "DefaultColor15",
        mfa_reward_claimed: false,
        quest_manager: { dailyLoginInterval: "0001-01-01T00:00:00.000Z", dailyQuestRerolls: 1, questPoolStats: {} },
        daily_rewards: {},
        past_seasons: [],
        season_match_boost: 0,
        season_friend_match_boost: 0,
        inventory_limit_bonus: 0,
        last_applied_loadout: LOCKER_ID,
        active_loadout_index: 0,
        loadouts: [LOCKER_ID],
        loadout_presets: {},
        pinned_quest: "",
        party_assist_quest: "",
      },
    },
  };
}

function getDefaultCommonCoreData(platform: string = "EpicPC"): Record<string, unknown> {
  const items: Record<string, Record<string, unknown>> = {
    [makeID()]: { templateId: "Currency:MtxPurchased", attributes: { platform: "Shared" }, quantity: 100000 },
    [makeID()]: { templateId: "Currency:MtxGiveaway", attributes: {}, quantity: 0 },
  };
  const banners: string[] = [];
  for (let i = 1; i <= 15; i++) {
    banners.push(`HomebaseBannerIcon:StandardBanner${i}`);
    banners.push(`HomebaseBannerColor:DefaultColor${i}`);
  }
  banners.push("HomebaseBannerIcon:StandardBanner15");
  banners.push("HomebaseBannerColor:DefaultColor15");
  const seen = new Set<string>();
  for (const t of banners) {
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    items[makeID()] = { templateId: t, attributes: { item_seen: true, seen: true }, quantity: 1 };
  }
  return {
    created: timeAsISO(),
    wipeNumber: 1,
    version: "versa_v1",
    items,
    stats: {
      attributes: {
        current_mtx_platform: platform,
        mtx_purchase_history: { refundsUsed: 0, refundCredits: 3, purchases: [] },
        daily_purchases: {},
        gift_history: { gifts: [], num_sent: 0, num_received: 0 },
        mtx_affiliate: "",
        mtx_affiliate_set_time: "0001-01-01T00:00:00.000Z",
        current_mtx_currency: "MtxPurchased",
      },
    },
  };
}

function getDefaultCampaignData(): Record<string, unknown> { return { created: timeAsISO(), wipeNumber: 1, version: "versa_v1", items: {}, stats: { attributes: { quest_manager: {}, world_results: [], homebase: { townName: "Homebase", bannerIconId: "StandardBanner15", bannerColorId: "DefaultColor15" }, homebase_name: "Homebase", client_settings: { pinnedQuestInstances: [] } } } }; }
function getDefaultCommonPublicData(): Record<string, unknown> { return { created: timeAsISO(), wipeNumber: 1, version: "versa_v1", items: {}, stats: { attributes: { banner_icon: "StandardBanner15", banner_color: "DefaultColor15", homebase_name: "Homebase", skydive_contrail: "" } } }; }
function getDefaultMetadataData(): Record<string, unknown> { return { created: timeAsISO(), wipeNumber: 1, version: "versa_v1", items: {}, stats: { attributes: {} } }; }

const EXPEDITION_POOL: Array<{ templateId: string; slot: string; minPower: number; maxPower: number; durationMin: number }> = [
  { templateId: "Expedition:expedition_sea_survivorscouting_short_t01", slot: "expedition.generation.sea.t01_0", minPower: 6, maxPower: 120, durationMin: 90 },
  { templateId: "Expedition:expedition_sea_supplyrun_short_t01", slot: "expedition.generation.sea.t01_1", minPower: 6, maxPower: 120, durationMin: 90 },
  { templateId: "Expedition:expedition_sea_supplyrun_medium_t02", slot: "expedition.generation.sea.t02_0", minPower: 15, maxPower: 160, durationMin: 150 },
  { templateId: "Expedition:expedition_sea_survivorscouting_medium_t02", slot: "expedition.generation.sea.t02_1", minPower: 15, maxPower: 160, durationMin: 150 },
  { templateId: "Expedition:expedition_sea_supplyrun_long_t03", slot: "expedition.generation.sea.t03_0", minPower: 23, maxPower: 200, durationMin: 240 },
  { templateId: "Expedition:expedition_sea_survivorscouting_medium_t03", slot: "expedition.generation.sea.t03_1", minPower: 23, maxPower: 200, durationMin: 240 },
  { templateId: "Expedition:expedition_sea_supplyrun_long_t04", slot: "expedition.generation.sea.t04_0", minPower: 34, maxPower: 240, durationMin: 360 },
  { templateId: "Expedition:expedition_supplyrun_short_t01", slot: "expedition.generation.land.t01_0", minPower: 6, maxPower: 120, durationMin: 90 },
  { templateId: "Expedition:expedition_supplyrun_medium_t02", slot: "expedition.generation.land.t02_0", minPower: 15, maxPower: 160, durationMin: 150 },
  { templateId: "Expedition:expedition_supplyrun_long_t03", slot: "expedition.generation.land.t03_0", minPower: 23, maxPower: 200, durationMin: 240 },
  { templateId: "Expedition:expedition_survivorscouting_long_t03", slot: "expedition.generation.land.t03_1", minPower: 23, maxPower: 200, durationMin: 240 },
  { templateId: "Expedition:expedition_survivorscouting_long_t04", slot: "expedition.generation.land.t04_0", minPower: 34, maxPower: 240, durationMin: 360 },
  { templateId: "Expedition:expedition_air_survivorscouting_long_t02", slot: "expedition.generation.air.t02_0", minPower: 15, maxPower: 160, durationMin: 150 },
  { templateId: "Expedition:expedition_air_survivorscouting_medium_t03", slot: "expedition.generation.air.t03_0", minPower: 23, maxPower: 200, durationMin: 240 },
  { templateId: "Expedition:expedition_air_survivorscouting_long_t04", slot: "expedition.generation.air.t04_0", minPower: 34, maxPower: 240, durationMin: 360 },
  { templateId: "Expedition:expedition_air_supplyrun_long_t02", slot: "expedition.generation.air.t02_1", minPower: 15, maxPower: 160, durationMin: 150 },
  { templateId: "Expedition:expedition_air_supplyrun_long_t03", slot: "expedition.generation.air.t03_1", minPower: 23, maxPower: 200, durationMin: 240 },
  { templateId: "Expedition:expedition_air_supplyrun_long_t04", slot: "expedition.generation.air.t04_1", minPower: 34, maxPower: 240, durationMin: 360 },
  { templateId: "Expedition:expedition_choppingwood_t00", slot: "expedition.generation.choppingwood", minPower: 1, maxPower: 40, durationMin: 30 },
  { templateId: "Expedition:expedition_miningore_t00", slot: "expedition.generation.miningore", minPower: 1, maxPower: 40, durationMin: 30 },
];

function makeExpeditionItem(def: (typeof EXPEDITION_POOL)[number]): Record<string, unknown> {
  const start = new Date();
  const end = new Date(start.getTime() + def.durationMin * 60000);
  return {
    templateId: def.templateId,
    attributes: {
      expedition_expiration_start_time: start.toISOString(),
      expedition_expiration_end_time: end.toISOString(),
      expedition_criteria: [],
      level: 1,
      expedition_max_target_power: def.maxPower,
      expedition_min_target_power: def.minPower,
      expedition_slot_id: def.slot,
    },
    quantity: 1,
  };
}

function refreshExpeditionItems(items: Record<string, Record<string, unknown>>, changes: ProfileChange[] | null): boolean {
  const now = Date.now();
  let dirty = false;
  const usedSlots = new Set<string>();
  for (const [id, item] of Object.entries(items)) {
    const tid = String((item as Record<string, unknown>).templateId || "");
    if (!tid.toLowerCase().startsWith("expedition:")) continue;
    const attrs = (item as Record<string, unknown>).attributes as Record<string, unknown>;
    const end = Date.parse(String(attrs.expedition_expiration_end_time || ""));
    const started = attrs.expedition_start_time !== undefined;
    if (!started && !Number.isNaN(end) && end <= now) {
      delete items[id];
      dirty = true;
      if (changes) changes.push({ changeType: "itemRemoved", itemId: id } as unknown as ProfileChange);
    } else {
      const slot = String(attrs.expedition_slot_id || "");
      if (slot) usedSlots.add(slot);
    }
  }
  let active = 0;
  for (const item of Object.values(items)) {
    if (String((item as Record<string, unknown>).templateId || "").toLowerCase().startsWith("expedition:")) active++;
  }
  const shuffled = [...EXPEDITION_POOL].sort(() => Math.random() - 0.5);
  for (const def of shuffled) {
    if (active >= 6) break;
    if (usedSlots.has(def.slot)) continue;
    const id = makeID();
    items[id] = makeExpeditionItem(def) as Record<string, unknown> as never;
    usedSlots.add(def.slot);
    active++;
    dirty = true;
    if (changes) changes.push({ changeType: "itemAdded", itemId: id, item: items[id] } as unknown as ProfileChange);
  }
  return dirty;
}

function normalizeProfileId(profileId: string): string {
  if (profileId === "profile0" || profileId === "campaign") return "campaign";
  if (profileId === "common_public") return "common_public";
  if (profileId === "common_core") return "common_core";
  if (profileId === "athena") return "athena";
  if (profileId === "creative") return "creative";
  if (profileId === "metadata") return "metadata";
  if (profileId === "collections") return "collections";
  return profileId;
}

function getOrCreateProfile(accountId: string, profileId: string, version?: ReturnType<typeof parseVersion>): { data: Record<string, unknown>; rvn: number; cmdRev: number; normalizedId: string } {
  const normalizedId = normalizeProfileId(profileId);
  const build = version?.build || 999;
  let profile = store.getProfile(accountId, normalizedId);
  if (normalizedId === "profile0") {
    const campaign = store.getProfile(accountId, "campaign");
    if (campaign) profile = { ...campaign, profileId: normalizedId } as typeof profile;
  }
  if (!profile) {
    let defaultData: Record<string, unknown> | null = null;
    const season = version?.season ?? getSeasonFromBuild(build);
    const mtxPlatform = getMtxPlatform(version?.platform || "Windows");
    switch (normalizedId) {
      case "athena": defaultData = getDefaultAthenaData(season, build < 4); break;
      case "common_core": defaultData = getDefaultCommonCoreData(mtxPlatform); break;
      case "common_public": defaultData = getDefaultCommonPublicData(); break;
      case "campaign": defaultData = getDefaultCampaignData(); break;
      case "metadata": defaultData = getDefaultMetadataData(); break;
      case "creative": defaultData = { created: timeAsISO(), wipeNumber: 1, version: "versa_v1", items: {}, stats: { attributes: {} } }; break;
      case "collections": defaultData = { created: timeAsISO(), wipeNumber: 1, version: "versa_v1", items: {}, stats: { attributes: {} } }; break;
      default: defaultData = { created: timeAsISO(), wipeNumber: 1, version: "versa_v1", items: {}, stats: { attributes: {} } };
    }
    profile = { accountId, profileId: normalizedId, rvn: 1, commandRevision: 0, data: defaultData };
    if (normalizedId === "campaign") {
      refreshExpeditionItems(defaultData.items as Record<string, Record<string, unknown>>, null);
    }
    store.saveProfile(profile);
  } else {
    const dataAny = profile.data as Record<string, unknown>;
    if (!dataAny.items || typeof dataAny.items !== "object") (dataAny as Record<string, unknown>).items = {};
    if (!dataAny.stats || typeof dataAny.stats !== "object") (dataAny as Record<string, unknown>).stats = { attributes: {} };
    const items = dataAny.items as Record<string, Record<string, unknown>>;
    let dirty = migrateOldItems(items);
    if (normalizedId === "campaign") {
      if (refreshExpeditionItems(items, null)) dirty = true;
    }
    if (normalizedId === "athena") {
      ensureLocker(items);
      ensureDefaults(items);
      if (build >= 4) {
      const ownedCount = Object.keys(items).length;
      if (ownedCount < FULL_LOCKER_COUNT) {
        const owned = new Set<string>();
        for (const key of Object.keys(items)) {
          const tid = (items[key] as Record<string, unknown>).templateId;
          if (typeof tid === "string" && tid) owned.add(tid.toLowerCase());
        }
        if (owned.size < FULL_LOCKER_COUNT) {
          for (const def of FULL_LOCKER) {
            if (!owned.has(def.templateId.toLowerCase())) {
              items[makeID()] = { templateId: def.templateId, attributes: cosmeticAttributes(def.variants), quantity: 1 };
              dirty = true;
            }
          }
        }
      } else {
        const locker = items[LOCKER_ID] as Record<string, unknown> | undefined;
        if (!locker) dirty = true;
      }
      }
      const attrs = ((dataAny.stats as Record<string, unknown>).attributes as Record<string, unknown>) || {};
      if (attrs.last_applied_loadout === undefined) { attrs.last_applied_loadout = LOCKER_ID; dirty = true; }
      if (attrs.loadouts === undefined) { attrs.loadouts = [LOCKER_ID]; dirty = true; }
      if (attrs.favorite_pickaxe === undefined) attrs.favorite_pickaxe = "AthenaPickaxe:DefaultPickaxe";
      if (attrs.favorite_glider === undefined) attrs.favorite_glider = "AthenaGlider:DefaultGlider";
      if (attrs.favorite_dance === undefined) attrs.favorite_dance = ["", "", "", "", "", ""];
      if (attrs.favorite_itemwraps === undefined) attrs.favorite_itemwraps = ["", "", "", "", "", "", ""];
      if (attrs.banner_icon === undefined) attrs.banner_icon = "StandardBanner15";
      if (attrs.banner_color === undefined) attrs.banner_color = "DefaultColor15";
      (dataAny.stats as Record<string, unknown>).attributes = attrs;
    }
    if (dirty) store.saveProfile(profile);
  }
  return { data: profile.data, rvn: profile.rvn, cmdRev: profile.commandRevision, normalizedId };
}

function saveProfile(accountId: string, profileId: string, data: Record<string, unknown>, rvn: number, cmdRev: number) { store.saveProfile({ accountId, profileId, rvn, commandRevision: cmdRev, data }); }

function findItemByTemplate(items: Record<string, Record<string, unknown>>, templateId: string): string | null {
  const want = templateId.toLowerCase();
  for (const [id, item] of Object.entries(items)) {
    if (String(item.templateId || "").toLowerCase() === want) return id;
  }
  return null;
}

function ownsTemplate(items: Record<string, Record<string, unknown>>, templateId: string): boolean {
  if (!templateId) return true;
  return findItemByTemplate(items, templateId) !== null;
}

function lockerSlotsData(items: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const locker = ensureLocker(items);
  const attrs = locker.attributes as Record<string, unknown>;
  const data = attrs.locker_slots_data as Record<string, unknown>;
  const slots = (data.slots as Record<string, Record<string, unknown>>) || {};
  return slots;
}

function applyEquip(items: Record<string, Record<string, unknown>>, attrs: Record<string, unknown>, slotName: string, itemToSlot: string, indexWithinSlot: number): string {
  const target = itemToSlot || "";
  const idx = Number.isFinite(indexWithinSlot) ? indexWithinSlot : 0;
  const slots = lockerSlotsData(items);
  const locker = ensureLocker(items);
  const lockerAttrs = locker.attributes as Record<string, unknown>;
  switch (slotName) {
    case "Character": attrs.favorite_character = target; break;
    case "Backpack": attrs.favorite_backpack = target; break;
    case "Pickaxe": attrs.favorite_pickaxe = target || "AthenaPickaxe:DefaultPickaxe"; break;
    case "Glider": attrs.favorite_glider = target || "AthenaGlider:DefaultGlider"; break;
    case "SkyDiveContrail":
    case "Contrail": attrs.favorite_skydivecontrail = target; break;
    case "MusicPack": attrs.favorite_musicpack = target; break;
    case "LoadingScreen": attrs.favorite_loadingscreen = target; break;
    case "Hat": attrs.favorite_hat = target; break;
    case "BattleBus": attrs.favorite_battlebus = target; break;
    case "VehicleDeco": attrs.favorite_vehicledeco = target; break;
    case "MapMarker": attrs.favorite_mapmarker = target; break;
    case "VictoryPose": attrs.favorite_victorypose = target; break;
    case "ConsumableEmote": attrs.favorite_consumableemote = target; break;
    case "CallingCard": attrs.favorite_callingcard = target; break;
    case "Spray": {
      const arr = Array.isArray(attrs.favorite_spray) ? (attrs.favorite_spray as string[]) : ["", "", "", "", "", ""];
      while (arr.length < 6) arr.push("");
      arr[idx] = target;
      attrs.favorite_spray = arr;
      break;
    }
    case "Dance":
    case "Emote": {
      const arr = Array.isArray(attrs.favorite_dance) ? (attrs.favorite_dance as string[]) : ["", "", "", "", "", ""];
      while (arr.length < 6) arr.push("");
      arr[idx] = target;
      attrs.favorite_dance = arr;
      break;
    }
    case "ItemWrap":
    case "Wrap": {
      const arr = Array.isArray(attrs.favorite_itemwraps) ? (attrs.favorite_itemwraps as string[]) : ["", "", "", "", "", "", ""];
      while (arr.length < 7) arr.push("");
      arr[idx] = target;
      attrs.favorite_itemwraps = arr;
      break;
    }
    default: break;
  }
  const slotKeyMap: Record<string, string> = { Character: "Character", Backpack: "Backpack", Pickaxe: "Pickaxe", Glider: "Glider", SkyDiveContrail: "SkyDiveContrail", Contrail: "SkyDiveContrail", MusicPack: "MusicPack", LoadingScreen: "LoadingScreen", Dance: "Dance", Emote: "Dance", ItemWrap: "ItemWrap", Wrap: "ItemWrap" };
  const slotKey = slotKeyMap[slotName];
  if (slotKey && slots[slotKey]) {
    const slot = slots[slotKey] as Record<string, unknown>;
    const slotItems = Array.isArray(slot.items) ? (slot.items as string[]) : [""];
    while (slotItems.length <= idx) slotItems.push("");
    slotItems[idx] = target;
    slot.items = slotItems;
  }
  if (slotName === "Dance" || slotName === "Emote" || slotName === "ItemWrap" || slotName === "Wrap" || slotName === "Spray") {
    return `${slotName}:${idx}`;
  }
  return slotName;
}

app.post("/fortnite/api/game/v2/profile/:accountId/client/:operation", async (c) => {
  const accountId = c.req.param("accountId");
  const operation = c.req.param("operation");
  const rawProfileId = c.req.query("profileId") || "athena";
  const rvnParam = parseInt(c.req.query("rvn") || "-1");
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const { data, rvn, cmdRev, normalizedId } = getOrCreateProfile(accountId, rawProfileId, version);
  const profileId = normalizedId;
  const dataAny = data as unknown as { items: Record<string, Record<string, unknown>>; stats: { attributes: Record<string, unknown> } };
  if (!dataAny.items) (data as Record<string, unknown>).items = {};
  if (!dataAny.stats) (data as Record<string, unknown>).stats = { attributes: {} } as never;
  if (!(dataAny.stats as unknown as Record<string, unknown>).attributes) (dataAny.stats as unknown as Record<string, unknown>).attributes = {};
  const items = (data as Record<string, unknown>).items as Record<string, Record<string, unknown>>;
  const attrs = ((data as Record<string, unknown>).stats as Record<string, unknown>).attributes as Record<string, unknown>;
  const changes: ProfileChange[] = [];
  const multiUpdate: Record<string, unknown>[] = [];
  const notifications: unknown[] = [];
  let newRvn = rvn;
  let newCmdRev = cmdRev;
  const build = version?.build || 999;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

  switch (operation) {
    case "QueryProfile": {
      if (Number.isNaN(rvnParam) || rvnParam < 0 || rvnParam !== rvn) {
        let outData = data;
        if (build < 4 && normalizedId === "athena") {
          const allItems = (data as Record<string, unknown>).items as Record<string, Record<string, unknown>>;
          const keys = Object.keys(allItems);
          if (keys.length > 600) {
            const kept: Record<string, Record<string, unknown>> = {};
            if (allItems[LOCKER_ID]) kept[LOCKER_ID] = allItems[LOCKER_ID] as Record<string, unknown>;
            let n = 0;
            for (const k of keys) {
              if (k === LOCKER_ID) continue;
              if (n >= 500) break;
              kept[k] = allItems[k] as Record<string, unknown>;
              n++;
            }
            outData = { ...(data as Record<string, unknown>), items: kept } as Record<string, unknown>;
          }
        }
        changes.push({ changeType: "fullProfileUpdate", profile: buildProfileObject(accountId, profileId, outData, rvn, cmdRev) } as unknown as ProfileChange);
      }
      break;
    }
    case "ClientQuestLogin": {
      const qm = (attrs.quest_manager as Record<string, unknown>) || {};
      const today = timeAsISO().slice(0, 10);
      const last = String(qm.dailyLoginInterval || "0001-01-01T00:00:00.000Z").slice(0, 10);
      if (last !== today) {
        qm.dailyLoginInterval = timeAsISO();
        const rerolls = typeof qm.dailyQuestRerolls === "number" ? qm.dailyQuestRerolls : 1;
        qm.dailyQuestRerolls = Math.min(1, Math.max(0, rerolls)) + (rerolls <= 0 ? 1 : 0);
        if (typeof qm.dailyQuestRerolls !== "number") qm.dailyQuestRerolls = 1;
        attrs.quest_manager = qm;
        newRvn++; newCmdRev++;
        changes.push(statChange("quest_manager", qm));
      }
      break;
    }
    case "MarkItemSeen": {
      const itemIds = ((body.itemIds as string[]) || []) as string[];
      let touched = false;
      for (const id of itemIds) {
        const it = items[id];
        if (it) {
          (it.attributes as Record<string, unknown>).item_seen = true;
          (it.attributes as Record<string, unknown>).seen = true;
          changes.push({ changeType: "itemAttrChanged", itemId: id, attributeName: "item_seen", attributeValue: true } as unknown as ProfileChange);
          touched = true;
        } else {
          const byTemplate = findItemByTemplate(items, id);
          if (byTemplate) {
            ((items[byTemplate] as Record<string, unknown>).attributes as Record<string, unknown>).item_seen = true;
            changes.push({ changeType: "itemAttrChanged", itemId: byTemplate, attributeName: "item_seen", attributeValue: true } as unknown as ProfileChange);
            touched = true;
          }
        }
      }
      if (touched) { newRvn++; newCmdRev++; }
      break;
    }
    case "SetItemFavoriteStatusBatch": {
      const itemIds = ((body.itemIds as string[]) || (body.itemFavStatus as string[]) || []) as string[];
      const fav = (body.itemFavStatus as boolean | undefined) ?? (body.status as boolean | undefined) ?? (body.favorite as boolean | undefined) ?? true;
      const ids = Array.isArray(body.itemIds) ? (body.itemIds as string[]) : itemIds;
      const status = typeof body.itemFavStatus === "boolean" ? (body.itemFavStatus as boolean) : (typeof fav === "boolean" ? fav : true);
      let touched = false;
      for (const id of ids) {
        const it = items[id];
        if (it) {
          (it.attributes as Record<string, unknown>).favorite = status;
          changes.push({ changeType: "itemAttrChanged", itemId: id, attributeName: "favorite", attributeValue: status } as unknown as ProfileChange);
          touched = true;
        }
      }
      if (touched) { newRvn++; newCmdRev++; }
      break;
    }
    case "SetItemFavoriteStatus": {
      const itemId = (body.itemId as string) || "";
      const fav = (body.itemToFavStatus as boolean) ?? (body.favorite as boolean) ?? false;
      const it = items[itemId];
      if (it) {
        (it.attributes as Record<string, unknown>).favorite = !!fav;
        newRvn++; newCmdRev++;
        changes.push({ changeType: "itemAttrChanged", itemId, attributeName: "favorite", attributeValue: !!fav } as unknown as ProfileChange);
      }
      break;
    }
    case "EquipBattleRoyaleCustomization": {
      const slotName = String(body.slotName || body.slot || "Character");
      const itemToSlot = String(body.itemToSlot || body.item || "");
      const idx = typeof body.indexWithinSlot === "number" ? (body.indexWithinSlot as number) : 0;
      if (itemToSlot && !ownsTemplate(items, itemToSlot)) {
        items[makeID()] = { templateId: itemToSlot, attributes: cosmeticAttributes(), quantity: 1 };
      }
      const key = applyEquip(items, attrs, slotName, itemToSlot, idx);
      newRvn++; newCmdRev++;
      if (slotName === "Dance" || slotName === "Emote" || slotName === "ItemWrap" || slotName === "Wrap" || slotName === "Spray") {
        const arrKey = slotName === "Spray" ? "favorite_spray" : (slotName === "Dance" || slotName === "Emote") ? "favorite_dance" : "favorite_itemwraps";
        changes.push(statChange(arrKey, attrs[arrKey]));
      } else {
        const favKeyMap: Record<string, string> = { Character: "favorite_character", Backpack: "favorite_backpack", Pickaxe: "favorite_pickaxe", Glider: "favorite_glider", SkyDiveContrail: "favorite_skydivecontrail", Contrail: "favorite_skydivecontrail", MusicPack: "favorite_musicpack", LoadingScreen: "favorite_loadingscreen" };
        const favKey = favKeyMap[slotName] || `favorite_${slotName.toLowerCase()}`;
        changes.push(statChange(favKey, attrs[favKey]));
      }
      changes.push(statChange("loadouts", attrs.loadouts || [LOCKER_ID]));
      void key;
      break;
    }
    case "BulkEquipBattleRoyaleCustomization": {
      const loadoutData = (body.loadoutData as Array<Record<string, unknown>>) || [];
      const touchedStats = new Set<string>();
      for (const entry of loadoutData) {
        const slotName = String(entry.slotName || entry.slot || "Character");
        const itemToSlot = String(entry.itemToSlot || entry.item || "");
        const idx = typeof entry.indexWithinSlot === "number" ? (entry.indexWithinSlot as number) : 0;
        if (itemToSlot && !ownsTemplate(items, itemToSlot)) {
          items[makeID()] = { templateId: itemToSlot, attributes: cosmeticAttributes(), quantity: 1 };
        }
        applyEquip(items, attrs, slotName, itemToSlot, idx);
        const favKeyMap: Record<string, string> = { Character: "favorite_character", Backpack: "favorite_backpack", Pickaxe: "favorite_pickaxe", Glider: "favorite_glider", SkyDiveContrail: "favorite_skydivecontrail", Contrail: "favorite_skydivecontrail", MusicPack: "favorite_musicpack", LoadingScreen: "favorite_loadingscreen", Dance: "favorite_dance", Emote: "favorite_dance", ItemWrap: "favorite_itemwraps", Wrap: "favorite_itemwraps", Spray: "favorite_spray" };
        touchedStats.add(favKeyMap[slotName] || `favorite_${slotName.toLowerCase()}`);
      }
      newRvn++; newCmdRev++;
      for (const k of touchedStats) changes.push(statChange(k, attrs[k]));
      break;
    }
    case "SetCosmeticLockerSlot": {
      const category = String(body.category || body.slotName || body.slot || "Character");
      const slotIndex = typeof body.slotIndex === "number" ? (body.slotIndex as number) : (typeof body.indexWithinSlot === "number" ? (body.indexWithinSlot as number) : 0);
      const itemToSlot = String(body.itemToSlot || body.itemId || body.item || "");
      if (itemToSlot && !ownsTemplate(items, itemToSlot)) {
        items[makeID()] = { templateId: itemToSlot, attributes: cosmeticAttributes(), quantity: 1 };
      }
      applyEquip(items, attrs, category, itemToSlot, slotIndex);
      newRvn++; newCmdRev++;
      const locker = ensureLocker(items);
      changes.push({ changeType: "itemAttrChanged", itemId: LOCKER_ID, attributeName: "locker_slots_data", attributeValue: (locker.attributes as Record<string, unknown>).locker_slots_data } as unknown as ProfileChange);
      break;
    }
    case "SetCosmeticLockerSlots": {
      const loadoutData = (body.loadoutData as Array<Record<string, unknown>>) || (body.slots as Array<Record<string, unknown>>) || [];
      for (const entry of loadoutData) {
        const slotName = String(entry.slotName || entry.category || "Character");
        const itemToSlot = String(entry.itemToSlot || entry.item || "");
        const idx = typeof entry.indexWithinSlot === "number" ? (entry.indexWithinSlot as number) : (typeof entry.slotIndex === "number" ? (entry.slotIndex as number) : 0);
        if (itemToSlot && !ownsTemplate(items, itemToSlot)) {
          items[makeID()] = { templateId: itemToSlot, attributes: cosmeticAttributes(), quantity: 1 };
        }
        applyEquip(items, attrs, slotName, itemToSlot, idx);
      }
      newRvn++; newCmdRev++;
      const locker = ensureLocker(items);
      changes.push({ changeType: "itemAttrChanged", itemId: LOCKER_ID, attributeName: "locker_slots_data", attributeValue: (locker.attributes as Record<string, unknown>).locker_slots_data } as unknown as ProfileChange);
      break;
    }
    case "SetCosmeticLockerBanner": {
      const icon = String(body.bannerIconTemplateName || body.bannerIcon || body.banner_icon_template || "StandardBanner15");
      const color = String(body.bannerColorTemplateName || body.bannerColor || body.banner_color_template || "DefaultColor15");
      const locker = ensureLocker(items);
      ((locker.attributes as Record<string, unknown>).banner_icon_template as string) = icon;
      ((locker.attributes as Record<string, unknown>).banner_color_template as string) = color;
      attrs.banner_icon = icon;
      attrs.banner_color = color;
      newRvn++; newCmdRev++;
      changes.push({ changeType: "itemAttrChanged", itemId: LOCKER_ID, attributeName: "banner_icon_template", attributeValue: icon } as unknown as ProfileChange);
      changes.push({ changeType: "itemAttrChanged", itemId: LOCKER_ID, attributeName: "banner_color_template", attributeValue: color } as unknown as ProfileChange);
      changes.push(statChange("banner_icon", icon));
      changes.push(statChange("banner_color", color));
      break;
    }
    case "SetBattleRoyaleBanner": {
      const icon = String(body.homebaseBannerIconId || body.bannerIcon || body.banner_icon || "StandardBanner15");
      const color = String(body.homebaseBannerColorId || body.bannerColor || body.banner_color || "DefaultColor15");
      const locker = ensureLocker(items);
      (locker.attributes as Record<string, unknown>).banner_icon_template = icon;
      (locker.attributes as Record<string, unknown>).banner_color_template = color;
      attrs.banner_icon = icon;
      attrs.banner_color = color;
      newRvn++; newCmdRev++;
      changes.push(statChange("banner_icon", icon));
      changes.push(statChange("banner_color", color));
      break;
    }
    case "SetCosmeticLockerName": {
      const locker = ensureLocker(items);
      const lockerName = String(body.name || body.lockerName || "Locker");
      (locker.attributes as Record<string, unknown>).locker_name = lockerName;
      newRvn++; newCmdRev++;
      changes.push({ changeType: "itemAttrChanged", itemId: LOCKER_ID, attributeName: "locker_name", attributeValue: lockerName } as unknown as ProfileChange);
      break;
    }
    case "SetRandomCosmeticLoadoutFlag": {
      newRvn++; newCmdRev++;
      changes.push(statChange("randomCosmeticLoadout", true));
      break;
    }
    case "CopyCosmeticLoadout": {
      const sourceIndex = typeof body.sourceIndex === "number" ? (body.sourceIndex as number) : 0;
      const targetIndex = typeof body.targetIndex === "number" ? (body.targetIndex as number) : 0;
      newRvn++; newCmdRev++;
      changes.push(statChange("copiedLoadout", { sourceIndex, targetIndex, id: makeID() }));
      break;
    }
    case "DeleteCosmeticLoadout": {
      newRvn++; newCmdRev++;
      changes.push(statChange("deletedLoadout", makeID()));
      break;
    }
    case "SetMtxPlatform": {
      const platform = getMtxPlatform(version?.platform || "Windows");
      attrs.current_mtx_platform = platform;
      newRvn++; newCmdRev++;
      changes.push(statChange("current_mtx_platform", platform));
      break;
    }
    case "SetAffiliateName": {
      const affiliate = String(body.affiliateName || "");
      const cc = profileId === "common_core" ? { items, attrs } : null;
      if (cc) {
        attrs.mtx_affiliate = affiliate;
        attrs.mtx_affiliate_set_time = timeAsISO();
        newRvn++; newCmdRev++;
        changes.push(statChange("mtx_affiliate", affiliate));
        changes.push(statChange("mtx_affiliate_set_time", attrs.mtx_affiliate_set_time));
      } else {
        const { data: ccData, rvn: ccRvn, cmdRev: ccCmd } = getOrCreateProfile(accountId, "common_core", version);
        const ccAttrs = ((ccData as Record<string, unknown>).stats as Record<string, unknown>).attributes as Record<string, unknown>;
        ccAttrs.mtx_affiliate = affiliate;
        ccAttrs.mtx_affiliate_set_time = timeAsISO();
        saveProfile(accountId, "common_core", ccData, ccRvn + 1, ccCmd + 1);
        newRvn++; newCmdRev++;
        changes.push(statChange("currentAffiliate", affiliate));
        multiUpdate.push({ profileRevision: ccRvn + 1, profileId: "common_core", profileChangesBaseRevision: ccRvn, profileChanges: [toWireChange(statChange("mtx_affiliate", affiliate))], profileCommandRevision: ccCmd + 1, serverTime: timeAsISO(), responseVersion: getMCPResponseVersion(build) });
      }
      break;
    }
    case "SetHomebaseName": {
      const homebaseName = String(body.homebaseName || body.homebase_name || "Homebase");
      if (profileId === "campaign") {
        const hb = (attrs.homebase as Record<string, unknown>) || {};
        hb.townName = homebaseName;
        attrs.homebase = hb;
        attrs.homebase_name = homebaseName;
        newRvn++; newCmdRev++;
        changes.push(statChange("homebase", hb));
      } else {
        attrs.homebase_name = homebaseName;
        newRvn++; newCmdRev++;
        changes.push(statChange("homebase_name", homebaseName));
      }
      break;
    }
    case "SetHomebaseBanner": {
      const icon = String(body.homebaseBannerIconId || body.bannerIcon || "StandardBanner15");
      const color = String(body.homebaseBannerColorId || body.bannerColor || "DefaultColor15");
      if (profileId === "campaign") {
        const hb = (attrs.homebase as Record<string, unknown>) || {};
        hb.bannerIconId = icon;
        hb.bannerColorId = color;
        attrs.homebase = hb;
        newRvn++; newCmdRev++;
        changes.push(statChange("homebase", hb));
      } else {
        attrs.banner_icon = icon;
        attrs.banner_color = color;
        newRvn++; newCmdRev++;
        changes.push(statChange("banner_icon", icon));
        changes.push(statChange("banner_color", color));
      }
      break;
    }
    case "PurchaseCatalogEntry": {
      const offerId = String(body.offerId || "");
      const offer = offerId ? getCatalogOffer(offerId) : null;
      if (!offer) {
        return c.json(errorResponse("com.epicgames.fortnite", "errors.com.epicgames.fortnite.offer_not_found", `Offer '${offerId}' not found`), 400);
      }
      const grantId = makeID();
      const grantTemplate = offer.cosmetic.templateId;
      if (!ownsTemplate(items, grantTemplate)) {
        items[grantId] = { templateId: grantTemplate, attributes: { ...cosmeticAttributes(), item_seen: false, seen: false }, quantity: 1 };
        newRvn++; newCmdRev++;
        changes.push({ changeType: "itemAdded", itemId: grantId, item: items[grantId] } as unknown as ProfileChange);
        const history = ((attrs as Record<string, unknown>).mtx_purchase_history as Record<string, unknown>) || undefined;
        if (profileId === "common_core" && history) {
          const purchases = Array.isArray(history.purchases) ? (history.purchases as unknown[]) : [];
          purchases.push({ purchaseId: makeID(), offerId, templateId: grantTemplate, totalMtxPaid: 0, purchaseDate: timeAsISO(), lootResult: [{ itemType: grantTemplate, itemGuid: grantId, itemProfile: "athena", quantity: 1 }] });
          (history as Record<string, unknown>).purchases = purchases;
          changes.push(statChange("mtx_purchase_history", history));
        }
        if (profileId !== "athena" && profileId !== "common_core") {
          const { data: athData, rvn: athRvn, cmdRev: athCmd } = getOrCreateProfile(accountId, "athena", version);
          const athItems = (athData as Record<string, unknown>).items as Record<string, Record<string, unknown>>;
          if (!ownsTemplate(athItems, grantTemplate)) {
            const athId = makeID();
            athItems[athId] = { templateId: grantTemplate, attributes: { ...cosmeticAttributes(), item_seen: false, seen: false }, quantity: 1 };
            saveProfile(accountId, "athena", athData, athRvn + 1, athCmd + 1);
            multiUpdate.push({ profileRevision: athRvn + 1, profileId: "athena", profileChangesBaseRevision: athRvn, profileChanges: [{ changeType: "itemAdded", itemId: athId, item: athItems[athId] }], profileCommandRevision: athCmd + 1, serverTime: timeAsISO(), responseVersion: getMCPResponseVersion(build) });
          }
        }
      } else {
        newRvn++; newCmdRev++;
        changes.push(statChange("lastPurchase", { offerId, purchaseTime: timeAsISO() }));
      }
      break;
    }
    case "GiftCatalogEntry": {
      const offerId = String(body.offerId || "");
      const receivers = ((body.receiverAccountIds as string[]) || []) as string[];
      const wrap = String(body.giftWrapTemplateId || "");
      const offer = offerId ? getCatalogOffer(offerId) : null;
      if (!offer) {
        return c.json(errorResponse("com.epicgames.fortnite", "errors.com.epicgames.fortnite.offer_not_found", `Offer '${offerId}' not found`), 400);
      }
      const giftId = makeID();
      const grantedId = makeID();
      const grantTemplate = offer.cosmetic.templateId;
      items[giftId] = { templateId: "GiftBox:gb_default", attributes: { max_level_bonus: 0, fromAccountId: accountId, lootList: [{ itemType: grantTemplate, itemGuid: grantedId, itemProfile: "athena", quantity: 1 }], level: 1, item_seen: false, seen: false, xp: 0, giftedOn: timeAsISO(), params: { SubGame: "Athena" }, favorite: false }, quantity: 1 };
      items[grantedId] = { templateId: grantTemplate, attributes: { ...cosmeticAttributes(), item_seen: false, seen: false }, quantity: 1 };
      newRvn++; newCmdRev++;
      changes.push({ changeType: "itemAdded", itemId: giftId, item: items[giftId] } as unknown as ProfileChange);
      changes.push({ changeType: "itemAdded", itemId: grantedId, item: items[grantedId] } as unknown as ProfileChange);
      for (const receiverId of receivers) {
        if (!receiverId || receiverId === accountId) continue;
        try {
          const r = getOrCreateProfile(receiverId, "athena", version);
          const rItems = (r.data as Record<string, unknown>).items as Record<string, Record<string, unknown>>;
          if (!ownsTemplate(rItems, grantTemplate)) {
            const rid = makeID();
            rItems[rid] = { templateId: grantTemplate, attributes: { ...cosmeticAttributes(), item_seen: false, seen: false }, quantity: 1 };
            const rgift = makeID();
            rItems[rgift] = { templateId: wrap || "GiftBox:gb_default", attributes: { max_level_bonus: 0, fromAccountId: accountId, lootList: [{ itemType: grantTemplate, itemGuid: rid, itemProfile: "athena", quantity: 1 }], level: 1, item_seen: false, xp: 0, giftedOn: timeAsISO(), favorite: false }, quantity: 1 };
            saveProfile(receiverId, "athena", r.data, r.rvn + 1, r.cmdRev + 1);
          }
        } catch { }
      }
      void wrap;
      break;
    }
    case "RefundMtxPurchase": {
      newRvn++; newCmdRev++;
      changes.push(statChange("lastRefund", timeAsISO()));
      break;
    }
    case "RemoveGiftBox": {
      const single = body.giftBoxItemId as string | undefined;
      const many = (body.giftBoxItemIds as string[] | undefined) || (single ? [single] : []);
      let touched = false;
      for (const id of many) {
        if (items[id]) {
          delete items[id];
          changes.push({ changeType: "itemRemoved", itemId: id } as unknown as ProfileChange);
          touched = true;
        }
      }
      if (touched) { newRvn++; newCmdRev++; }
      break;
    }
    case "RefreshExpeditions": {
      newRvn++; newCmdRev++;
      const before = changes.length;
      refreshExpeditionItems(items, changes);
      if (build < 4 && changes.length === before) {
        changes.push({ changeType: "fullProfileUpdate", profile: buildProfileObject(accountId, profileId, data, newRvn, newCmdRev) } as unknown as ProfileChange);
      }
      break;
    }
    case "GetMcpTimeForLogin": {
      if (build < 4) {
        newRvn++; newCmdRev++;
        changes.push({ changeType: "fullProfileUpdate", profile: buildProfileObject(accountId, profileId, data, newRvn, newCmdRev) } as unknown as ProfileChange);
      }
      break;
    }
    case "IncrementNamedCounterStat": { newRvn++; newCmdRev++; changes.push(statChange("counterIncrement", timeAsISO())); break; }
    case "SetHardcoreModifier": { newRvn++; newCmdRev++; changes.push(statChange("hardcoreModifier", (body.modifier as number) ?? 0)); break; }
    case "SetPartyAssistQuest": {
      attrs.party_assist_quest = String(body.questToPinAsPartyAssist || body.questId || "");
      newRvn++; newCmdRev++;
      changes.push(statChange("party_assist_quest", attrs.party_assist_quest));
      break;
    }
    case "AthenaPinQuest": {
      attrs.pinned_quest = String(body.pinnedQuest || body.questId || "");
      newRvn++; newCmdRev++;
      changes.push(statChange("pinned_quest", attrs.pinned_quest));
      break;
    }
    case "SetPinnedQuests": {
      if (profileId === "campaign") {
        const cs = (attrs.client_settings as Record<string, unknown>) || {};
        cs.pinnedQuestInstances = (body.pinnedQuestIds as string[]) || (body.pinnedQuestInstances as string[]) || [];
        attrs.client_settings = cs;
        newRvn++; newCmdRev++;
        changes.push(statChange("client_settings", cs));
      } else {
        attrs.pinned_quest = String(((body.questIds as string[]) || [])[0] || "");
        newRvn++; newCmdRev++;
        changes.push(statChange("pinned_quest", attrs.pinned_quest));
      }
      break;
    }
    case "FortRerollDailyQuest": { newRvn++; newCmdRev++; changes.push(statChange("rerolledQuest", timeAsISO())); break; }
    case "MarkNewQuestNotificationSent": {
      const ids = ((body.itemIds as string[]) || []) as string[];
      let touched = false;
      for (const id of ids) {
        if (items[id]) {
          (items[id].attributes as Record<string, unknown>).sent_new_notification = true;
          changes.push({ changeType: "itemAttrChanged", itemId: id, attributeName: "sent_new_notification", attributeValue: true } as unknown as ProfileChange);
          touched = true;
        }
      }
      if (touched) { newRvn++; newCmdRev++; }
      break;
    }
    case "ClaimLoginReward":
    case "ClaimMfaEnabled":
    case "ClaimImportFriends":
    case "GetQuota":
    case "SetForcedIntroPlayed":
    case "SetReceiveGiftsEnabled":
    case "RedeemRealMoneyPurchases":
    case "VerifyRealMoneyPurchase":
    case "PopulatePrerolledOffers":
    case "RequestRestedStateIncrease":
    case "UpdateQuestClientObjectives":
    case "ClaimQuestReward":
    case "SetSeasonPassAutoClaim":
    case "SetLoadoutShuffleEnabled":
    case "PutModularCosmeticLoadout":
    case "SetHeroCosmeticVariants":
    case "SetActiveArchetype":
    case "SetItemArchivedStatusBatch": break;
    case "ExchangeGameCurrencyForBattlePassOffer":
    case "ExchangeGameCurrencyForSeasonPassOffer": {
      newRvn++; newCmdRev++;
      changes.push(statChange("lastExchange", { offerId: String(body.offerId || ""), time: timeAsISO() }));
      break;
    }
    default: {
      newRvn++; newCmdRev++;
      break;
    }
  }

  void shouldForceBRMode;
  void supportsNewMCPFormat;
  if (changes.length > 0 || newRvn !== rvn) saveProfile(accountId, profileId, data, newRvn, newCmdRev);

  const respVersion = getMCPResponseVersion(build);
  return c.json(buildMCPResponse(profileId, newRvn, newCmdRev, changes, multiUpdate, notifications, respVersion));
});

app.post("/fortnite/api/game/v2/profile/:accountId/dedicated_server/:operation", async (c) => {
  const accountId = c.req.param("accountId");
  const operation = c.req.param("operation");
  const rawProfileId = c.req.query("profileId") || "athena";
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const build = version?.build || 999;
  const { data, rvn, cmdRev, normalizedId } = getOrCreateProfile(accountId, rawProfileId, version);
  return c.json(buildMCPResponse(normalizedId, rvn, cmdRev, [], [], [], getMCPResponseVersion(build)));
});

app.post("/fortnite/api/game/v2/profile/:accountId/client/:operation/multiUpdate", async (c) => {
  const accountId = c.req.param("accountId");
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const build = version?.build || 999;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const profileUpdates = (body.profileUpdates as Array<Record<string, unknown>>) || [];
  const results: Record<string, unknown>[] = [];
  for (const update of profileUpdates) {
    const profId = String(update.profileId || "athena");
    const { data, rvn, cmdRev, normalizedId } = getOrCreateProfile(accountId, profId, version);
    const newRvn = rvn + 1;
    const newCmdRev = cmdRev + 1;
    saveProfile(accountId, normalizedId, data, newRvn, newCmdRev);
    results.push({ profileRevision: newRvn, profileId: normalizedId, profileChangesBaseRevision: rvn, profileChanges: [], profileCommandRevision: newCmdRev, serverTime: timeAsISO(), responseVersion: getMCPResponseVersion(build) });
  }
  return c.json({ profileUpdates: results, responseVersion: getMCPResponseVersion(build) });
});

export default app;
