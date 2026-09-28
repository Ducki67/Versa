export interface VersionInfo {
  season: number;
  build: number;
  CL: string;
  lobby: string;
  isMobile: boolean;
  platform: string;
}

export function normalizePlatform(userAgent: string): string {
  const ua = userAgent || "";
  const paren = ua.match(/\(([^)]+)\)/);
  const hay = `${paren?.[1] || ""} ${ua}`;
  if (/Android/i.test(hay)) return "Android";
  if (/iPhone|iPad|iOS/i.test(hay)) return "IOS";
  if (/Nintendo.*Switch|Switch/i.test(hay)) return "Switch";
  if (/PS4|PS5|PlayStation/i.test(hay)) return "PlayStation";
  if (/Xbox|XboxOne|XSX/i.test(hay)) return "Xbox";
  if (/Mac|OSX|macOS|Darwin/i.test(hay)) return "Mac";
  if (/Linux/i.test(hay)) return "Linux";
  return "Windows";
}

export function isMobileUserAgent(userAgent: string): boolean {
  const platform = normalizePlatform(userAgent);
  if (platform === "Android" || platform === "IOS") return true;
  return /(Android|iPhone|iPad|Mobile)/i.test(userAgent || "");
}

export function getMtxPlatform(platform: string): string {
  switch (platform) {
    case "Android": return "Android";
    case "IOS": return "IOS";
    case "Switch": return "Switch";
    case "PlayStation": return "PSN";
    case "Xbox": return "Live";
    case "Mac": return "Mac";
    default: return "EpicPC";
  }
}

export function parseVersion(userAgent: string): VersionInfo {
  const ua = userAgent || "";
  const clMatch = ua.match(/-CL-(\d+)/);
  const CL = clMatch?.[1] || "0";
  const releaseMatch = ua.match(/Release-([\d.]+)-/);
  let season = 1;
  let build = 1.0;
  if (releaseMatch?.[1]) {
    const parts = releaseMatch[1].split(".");
    season = parseInt(parts[0] || "1", 10) || 1;
    if (parts.length >= 3) {
      build = parseFloat(`${parts[0]}.${parts[1]}${parts[2]}`) || parseFloat(`${parts[0]}.${parts[1]}`) || season;
    } else if (parts.length === 2) {
      build = parseFloat(`${parts[0]}.${parts[1]}`) || season;
    } else {
      build = parseFloat(parts[0] || "1") || season;
    }
    if (!Number.isFinite(build)) build = season;
    if (!Number.isFinite(season) || season < 1) season = getSeasonFromBuild(build) || 1;
  } else {
    season = 1;
    build = 1.0;
  }
  const platform = normalizePlatform(ua);
  const isMobile = platform === "Android" || platform === "IOS" || isMobileUserAgent(ua);
  return {
    season,
    build,
    CL,
    lobby: `LobbySeason${season}`,
    isMobile,
    platform,
  };
}

export function getSeasonFromBuild(build: number): number {
  if (build < 2.0) return 1;
  if (build < 3.0) return 2;
  if (build < 4.0) return 3;
  if (build < 5.0) return 4;
  if (build < 6.0) return 5;
  if (build < 7.0) return 6;
  if (build < 8.0) return 7;
  if (build < 9.0) return 8;
  if (build < 10.0) return 9;
  if (build < 11.0) return 10;
  if (build < 12.0) return 11;
  if (build < 13.0) return 12;
  if (build < 14.0) return 13;
  if (build < 15.0) return 14;
  if (build < 16.0) return 15;
  if (build < 17.0) return 16;
  if (build < 18.0) return 17;
  if (build < 19.0) return 18;
  if (build < 20.0) return 19;
  if (build < 21.0) return 20;
  if (build < 22.0) return 21;
  if (build < 23.0) return 22;
  if (build < 24.0) return 23;
  if (build < 25.0) return 24;
  if (build < 26.0) return 25;
  if (build < 27.0) return 26;
  if (build < 28.0) return 27;
  if (build < 29.0) return 28;
  if (build < 30.0) return 29;
  if (build < 31.0) return 30;
  if (build < 32.0) return 31;
  if (build < 33.0) return 32;
  if (build < 34.0) return 33;
  return Math.floor(build);
}

export function supportsNewMCPFormat(build: number): boolean { return build >= 1.0; }
export function supportsItemShop(build: number): boolean { return build >= 1.0; }
export function supportsCloudStorage(build: number): boolean { return build >= 1.0; }
export function supportsMatchmaking(build: number): boolean { return build >= 1.0; }
export function supportsFriendsList(build: number): boolean { return build >= 1.0; }
export function supportsLobby(build: number): boolean { return build >= 1.0; }
export function supportsFullLocker(build: number): boolean { return build >= 1.0; }
export function supportsMultiUpdate(build: number): boolean { return build >= 2.0; }
export function supportsGiftSystem(build: number): boolean { return build >= 2.0; }
export function supportsBattlePass(build: number): boolean { return build >= 1.0; }
export function supportsBannerSystem(build: number): boolean { return build >= 1.0; }
export function supportsPlaylistQuery(build: number): boolean { return build >= 1.7; }
export function supportsCommandRevision(build: number): boolean { return build >= 12.0; }
export function supportsEnhancedMatchmaking(build: number): boolean { return build >= 14.0; }
export function supportsEncryptionDisabled(build: number): boolean { return build >= 23.0; }

export function getMCPResponseVersion(build: number): number {
  if (build < 2.0) return 1;
  if (build < 5.0) return 2;
  if (build < 12.0) return 3;
  if (build < 14.0) return 4;
  return 5;
}

export function shouldForceBRMode(build: number): boolean { return build >= 19.3; }
export function shouldDisableEncryption(build: number): boolean { return build >= 23.0; }

export function getMinBuildForSeason(season: number): number { return season; }

export function isVersionSupported(build: number): boolean { return build >= 1.0; }

export function getPlatformFromUserAgent(userAgent: string): string {
  return normalizePlatform(userAgent);
}

export function getPlaylistFromBuild(build: number): string {
  return build < 2.0 ? "Playlist_DefaultSolo" : "Playlist_DefaultDuo";
}

export function getVersionString(build: number): string {
  const season = getSeasonFromBuild(build);
  return `${season}.0.0-${build}-CL-0`;
}

export function getVersionCompatibility(build: number): { features: string[] } {
  const features: string[] = [];
  if (build >= 1.0) features.push("fullLocker", "mcp", "matchmaking", "lobby");
  if (build >= 2.0) features.push("multiUpdate", "giftSystem", "battlePass");
  if (build >= 3.0) features.push("enhancedMCP", "catalogPurchase");
  if (build >= 5.0) features.push("advancedLobby", "playlistSupport");
  if (build >= 12.0) features.push("commandRevision", "profileManagement");
  if (build >= 14.0) features.push("enhancedMatchmaking", "tournamentSupport");
  if (build >= 19.0) features.push("chapter3", "saveTheWorld");
  if (build >= 23.0) features.push("encryptionDisabled", "newInventory");
  return { features };
}

export function getFeatureTimeline(): Array<{ feature: string; build: number; season: number }> {
  return [
    { feature: "fullLocker", build: 1.0, season: 1 },
    { feature: "mcp", build: 1.0, season: 1 },
    { feature: "matchmaking", build: 1.0, season: 1 },
    { feature: "lobby", build: 1.0, season: 1 },
    { feature: "multiUpdate", build: 2.0, season: 2 },
    { feature: "giftSystem", build: 2.0, season: 2 },
    { feature: "battlePass", build: 2.0, season: 2 },
    { feature: "enhancedMCP", build: 3.0, season: 3 },
    { feature: "catalogPurchase", build: 3.0, season: 3 },
    { feature: "advancedLobby", build: 5.0, season: 5 },
    { feature: "playlistSupport", build: 5.0, season: 5 },
    { feature: "commandRevision", build: 12.0, season: 12 },
    { feature: "profileManagement", build: 12.0, season: 12 },
    { feature: "enhancedMatchmaking", build: 14.0, season: 14 },
    { feature: "tournamentSupport", build: 14.0, season: 14 },
    { feature: "chapter3", build: 19.0, season: 19 },
    { feature: "saveTheWorld", build: 19.0, season: 19 },
    { feature: "encryptionDisabled", build: 23.0, season: 23 },
  ];
}

export function isBuildSupported(build: number): boolean { return build >= 1.0 && build <= 50.0; }

export function getAllFeatures(): string[] {
  return ["fullLocker", "mcp", "matchmaking", "lobby", "multiUpdate", "giftSystem", "battlePass", "enhancedMCP", "catalogPurchase", "advancedLobby", "playlistSupport", "commandRevision", "profileManagement", "enhancedMatchmaking", "tournamentSupport", "chapter3", "saveTheWorld", "encryptionDisabled"];
}

export function hasFeature(build: number, feature: string): boolean {
  return getVersionCompatibility(build).features.includes(feature);
}

export function getCLFromBuild(build: number): string { return Math.floor(build * 1000).toString(); }

export function getBuildFromCL(cl: string): number { return Math.floor(parseInt(cl)) / 1000; }
