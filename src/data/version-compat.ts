export interface VersionInfo {
  season: number;
  build: number;
  CL: string;
  lobby: string;
  isMobile: boolean;
  platform: string;
}

export function parseVersion(userAgent: string): VersionInfo {
  const match = userAgent.match(
    /Fortnite\/\+\+Fortnite\+Release-(\d+)\.(\d+)(?:\.(\d+))?-CL-(\d+)/
  );
  const mobileMatch = userAgent.match(/(Android|iOS|iPhone|iPad)/i);
  const platformMatch = userAgent.match(/\(([^)]+)\)/);

  if (!match) {
    const clOnly = userAgent.match(/-CL-(\d+)/);
    return {
      season: 1,
      build: 1.0,
      CL: clOnly?.[1] || "0",
      lobby: "",
      isMobile: !!mobileMatch,
      platform: platformMatch?.[1] || "Windows",
    };
  }

  const major = parseInt(match[1]);
  const minor = match[2];

  return {
    season: major,
    build: parseFloat(`${major}.${minor}`),
    CL: match[4],
    lobby: "",
    isMobile: !!mobileMatch,
    platform: platformMatch?.[1] || "Windows",
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

export function supportsNewMCPFormat(build: number): boolean {
  return build >= 2.0;
}

export function supportsItemShop(build: number): boolean {
  return build >= 2.0;
}

export function supportsCloudStorage(build: number): boolean {
  return build >= 2.0;
}

export function supportsMatchmaking(build: number): boolean {
  return build >= 1.8;
}

export function supportsFriendsList(build: number): boolean {
  return build >= 2.0;
}

export function getMCPResponseVersion(build: number): number {
  return 1;
}

export function shouldForceBRMode(build: number): boolean {
  return build >= 19.3;
}

export function shouldDisableEncryption(build: number): boolean {
  return build >= 23.0;
}
