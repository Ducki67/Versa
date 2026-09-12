export interface CosmeticDef {
  templateId: string;
  name: string;
  rarity: string;
  type: string;
  series?: string;
  genAddons?: string[];
}

function genCid(base: string, idx: number, suffix: string): string {
  return `CID_${String(idx).padStart(3, "0")}_Athena_Commando_${suffix}`;
}

function genItems(
  prefix: string,
  count: number,
  type: string,
  namingFn: (i: number) => string,
  rarityFn: (i: number) => string
): CosmeticDef[] {
  const items: CosmeticDef[] = [];
  for (let i = 1; i <= count; i++) {
    items.push({
      templateId: `${prefix}:${prefix}_${String(i).padStart(3, "0")}`,
      name: namingFn(i),
      rarity: rarityFn(i),
      type,
    });
  }
  return items;
}

const RARITY_POOL = [
  "EFortRarity::Common",
  "EFortRarity::Uncommon",
  "EFortRarity::Rare",
  "EFortRarity::Epic",
  "EFortRarity::Legendary",
];

export const ALL_SKINS: CosmeticDef[] = [
  ...genItems("AthenaCharacter", 100, "Character", (i) => `Skin ${i}`, (i) => RARITY_POOL[i % 5]),
  { templateId: "AthenaCharacter:CID_001_Athena_Commando_F", name: "Ramirez", rarity: "EFortRarity::Common", type: "Character" },
  { templateId: "AthenaCharacter:CID_002_Athena_Commando_M", name: "Jonesy", rarity: "EFortRarity::Common", type: "Character" },
  { templateId: "AthenaCharacter:CID_003_Athena_Commando_F", name: "Wildcat", rarity: "EFortRarity::Common", type: "Character" },
  { templateId: "AthenaCharacter:CID_004_Athena_Commando_M", name: "Renegade Raider", rarity: "EFortRarity::Rare", type: "Character" },
  { templateId: "AthenaCharacter:CID_005_Athena_Commando_F", name: "Assault Trooper", rarity: "EFortRarity::Common", type: "Character" },
  { templateId: "AthenaCharacter:CID_015_Athena_Commando_F", name: "Raptor", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_017_Athena_Commando_F", name: "Ghoul Trooper", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_018_Athena_Commando_M", name: "Skull Trooper", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_024_Athena_Commando_M", name: "Tomatohead", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_025_Athena_Commando_F", name: "Dark Bomber", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_026_Athena_Commando_M", name: "Red Knight", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_028_Athena_Commando_M", name: "John Wick", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_030_Athena_Commando_M", name: "Fishstick", rarity: "EFortRarity::Rare", type: "Character" },
  { templateId: "AthenaCharacter:CID_036_Athena_Commando_M", name: "Royale Knight", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_055_Athena_Commando_F", name: "Brite Bomber", rarity: "EFortRarity::Rare", type: "Character" },
  { templateId: "AthenaCharacter:CID_062_Athena_Commando_M", name: "Omega", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_063_Athena_Commando_F", name: "Carbide", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_064_Athena_Commando_M", name: "Raven", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_066_Athena_Commando_M", name: "Black Knight", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_082_Athena_Commando_M", name: "Drift", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_081_Athena_Commando_F", name: "Catalyst", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_088_Athena_Commando_M", name: "Dusk", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_092_Athena_Commando_M", name: "Hybrid", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_072_Athena_Commando_M", name: "A.I.M.", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_076_Athena_Commando_M", name: "Diecast", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_075_Athena_Commando_F", name: "Fireworks Team Leader", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_054_Athena_Commando_M", name: "Wukong", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_059_Athena_Commando_F", name: "Vertex", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_060_Athena_Commando_M", name: "Magnus", rarity: "EFortRarity::Legendary", type: "Character" },
  { templateId: "AthenaCharacter:CID_045_Athena_Commando_F", name: "Love Ranger", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_014_Athena_Commando_M", name: "Havoc", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_037_Athena_Commando_F", name: "Blue Team Leader", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_038_Athena_Commando_M", name: "Sparkle Trooper", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_040_Athena_Commando_M", name: "Rogue Agent", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_098_Athena_Commando_M", name: "Rex", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_099_Athena_Commando_F", name: "Tricera Ops", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_097_Athena_Commando_F", name: "Chrono", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_091_Athena_Commando_F", name: "Sun Strider", rarity: "EFortRarity::Epic", type: "Character" },
  { templateId: "AthenaCharacter:CID_083_Athena_Commando_F", name: "Huntress", rarity: "EFortRarity::Legendary", type: "Character" },
];

export const ALL_BACK_BLINGS: CosmeticDef[] = [
  ...genItems("AthenaBackpack", 50, "BackBling", (i) => `Back Bling ${i}`, (i) => RARITY_POOL[i % 5]),
  { templateId: "AthenaBackpack:bid_003", name: "Raven Wings", rarity: "EFortRarity::Legendary", type: "BackBling" },
  { templateId: "AthenaBackpack:bid_005", name: "Black Shield", rarity: "EFortRarity::Legendary", type: "BackBling" },
  { templateId: "AthenaBackpack:bid_006", name: "Red Shield", rarity: "EFortRarity::Legendary", type: "BackBling" },
  { templateId: "AthenaBackpack:bid_007", name: "Love Wings", rarity: "EFortRarity::Epic", type: "BackBling" },
  { templateId: "AthenaBackpack:bid_010", name: "Mechanical Wings", rarity: "EFortRarity::Epic", type: "BackBling" },
];

export const ALL_PICKAXES: CosmeticDef[] = [
  ...genItems("AthenaPickaxe", 50, "Pickaxe", (i) => `Pickaxe ${i}`, (i) => RARITY_POOL[i % 5]),
  { templateId: "AthenaPickaxe:pickaxe_id_001_TeslaCoil", name: "Tesla Coil", rarity: "EFortRarity::Legendary", type: "Pickaxe" },
  { templateId: "AthenaPickaxe:pickaxe_id_002_AxeAxes", name: "Axe Axes", rarity: "EFortRarity::Rare", type: "Pickaxe" },
];

export const ALL_GLIDERS: CosmeticDef[] = [
  ...genItems("AthenaGlider", 50, "Glider", (i) => `Glider ${i}`, (i) => RARITY_POOL[i % 5]),
  { templateId: "AthenaGlider:glider_id_001_Umbrella", name: "Umbrella", rarity: "EFortRarity::Common", type: "Glider" },
];

export const ALL_CONTRAILS: CosmeticDef[] = genItems("AthenaDanceTransport", 30, "Contrail", (i) => `Contrail ${i}`, (i) => RARITY_POOL[i % 5]);

export const ALL_EMOTES: CosmeticDef[] = [
  ...genItems("AthenaDance", 100, "Dance", (i) => `Emote ${i}`, (i) => RARITY_POOL[i % 5]),
  { templateId: "AthenaDance:eid_Breakdance", name: "Electro Shuffle", rarity: "EFortRarity::Rare", type: "Dance" },
  { templateId: "AthenaDance:eid_Floss", name: "Floss", rarity: "EFortRarity::Epic", type: "Dance" },
  { templateId: "AthenaDance:eid_Dab", name: "Dab", rarity: "EFortRarity::Uncommon", type: "Dance" },
  { templateId: "AthenaDance:eid_Robot", name: "Robot", rarity: "EFortRarity::Rare", type: "Dance" },
  { templateId: "AthenaDance:eid_TakeTheL", name: "Take the L", rarity: "EFortRarity::Rare", type: "Dance" },
  { templateId: "AthenaDance:eid_RideThePony", name: "Ride the Pony", rarity: "EFortRarity::Uncommon", type: "Dance" },
  { templateId: "AthenaDance:eid_HipHop", name: "Electro Shuffle", rarity: "EFortRarity::Epic", type: "Dance" },
  { templateId: "AthenaDance:eid_Byte", name: "Bytes", rarity: "EFortRarity::Epic", type: "Dance" },
  { templateId: "AthenaDance:eid_Tidy", name: "Tidy", rarity: "EFortRarity::Rare", type: "Dance" },
  { templateId: "AthenaDance:eid_Fresh", name: "Fresh", rarity: "EFortRarity::Epic", type: "Dance" },
  { templateId: "AthenaDance:eid_Slide", name: "Orange Justice", rarity: "EFortRarity::Free", type: "Dance" },
];

export const ALL_LOADING_SCREENS: CosmeticDef[] = [
  ...genItems("AthenaLoadingScreen", 30, "LoadingScreen", (i) => `Loading Screen ${i}`, (i) => RARITY_POOL[i % 5]),
  { templateId: "AthenaLoadingScreen:lsid_001_BattlePassS1", name: "Season 1", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_002_BattlePassS2", name: "Season 2", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_003_BattlePassS3", name: "Season 3", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_004_BattlePassS4", name: "Season 4", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_005_BattlePassS5", name: "Season 5", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_006_BattlePassS6", name: "Season 6", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_007_BattlePassS7", name: "Season 7", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_008_BattlePassS8", name: "Season 8", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_009_BattlePassS9", name: "Season 9", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_010_BattlePassS10", name: "Season X", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
  { templateId: "AthenaLoadingScreen:lsid_011_BattlePassS11", name: "Chapter 2 S1", rarity: "EFortRarity::Epic", type: "LoadingScreen" },
];

export const ALL_MUSIC_PACKS: CosmeticDef[] = genItems("AthenaMusicPack", 30, "MusicPack", (i) => `Music Pack ${i}`, (i) => RARITY_POOL[i % 5]);

export const ALL_WRAPS: CosmeticDef[] = genItems("AthenaItemWrap", 50, "Wrap", (i) => `Wrap ${i}`, (i) => RARITY_POOL[i % 5]);

export const ALL_SPRAYS: CosmeticDef[] = genItems("AthenaDanceSpray", 50, "Spray", (i) => `Spray ${i}`, (i) => RARITY_POOL[i % 5]);

export const ALL_TOYS: CosmeticDef[] = genItems("AthenaDanceToy", 20, "Toy", (i) => `Toy ${i}`, (i) => RARITY_POOL[i % 5]);

export const ALL_PET_CODES: CosmeticDef[] = [
  { templateId: "AthenaPet:Pet_BoneY", name: "Bonesy", rarity: "EFortRarity::Uncommon", type: "Pet" },
  { templateId: "AthenaPet:Pet_Chipper", name: "Chipper", rarity: "EFortRarity::Rare", type: "Pet" },
  { templateId: "AthenaPet:Pet_Smak", name: "Scales", rarity: "EFortRarity::Epic", type: "Pet" },
  { templateId: "AthenaPet:Pet_Falcon", name: "Katie", rarity: "EFortRarity::Epic", type: "Pet" },
  { templateId: "AthenaPet:Pet_PinkBear", name: "P.A.N.D.A.", rarity: "EFortRarity::Legendary", type: "Pet" },
];

export const ALL_BANNERS: CosmeticDef[] = genItems("AthenaBanner", 100, "Banner", (i) => `Banner ${i}`, () => "EFortRarity::Common");

export function getAllCosmetics(): CosmeticDef[] {
  return [
    ...ALL_SKINS,
    ...ALL_BACK_BLINGS,
    ...ALL_PICKAXES,
    ...ALL_GLIDERS,
    ...ALL_CONTRAILS,
    ...ALL_EMOTES,
    ...ALL_LOADING_SCREENS,
    ...ALL_MUSIC_PACKS,
    ...ALL_WRAPS,
    ...ALL_SPRAYS,
    ...ALL_TOYS,
    ...ALL_PET_CODES,
    ...ALL_BANNERS,
  ];
}

export function getCosmeticsByType(type: string): CosmeticDef[] {
  return getAllCosmetics().filter((c) => c.type === type);
}

export const COSMETIC_TYPE_MAP: Record<string, string> = {
  Character: "AthenaCharacter",
  BackBling: "AthenaBackpack",
  Pickaxe: "AthenaPickaxe",
  Glider: "AthenaGlider",
  Contrail: "AthenaDanceTransport",
  Dance: "AthenaDance",
  LoadingScreen: "AthenaLoadingScreen",
  MusicPack: "AthenaMusicPack",
  Wrap: "AthenaItemWrap",
  Toy: "AthenaDanceToy",
  Spray: "AthenaDanceSpray",
  Banner: "AthenaBanner",
  Pet: "AthenaPet",
};
