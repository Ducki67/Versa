import { Hono } from "hono";
import { type VersionInfo } from "../data/version-compat";
import { getCatalogSummary } from "../services/catalog";

const app = new Hono();

function backgroundStage(season: number, build: number): string {
  if (season === 10) return "seasonx";
  if (build === 11.31 || build === 11.4) return "winter19";
  if (build === 19.01) return "winter2021";
  if (build === 11.1) return "fortnitemares";
  if (season >= 21) return `season${season}00`;
  if (season === 9) return "default";
  return `season${season}`;
}

function pageContext(version?: VersionInfo) {
  const catalog = getCatalogSummary();
  const season = version?.season ?? 1;
  const build = version?.build ?? 1;
  const platform = version?.platform ?? "Windows";
  return {
    _activeDate: catalog.activationDate,
    _lastModified: catalog.activationDate,
    lastModified: catalog.activationDate,
    _locale: "en",
    season,
    build,
    platform,
    catalog,
  };
}

app.get("/content/api/pages/fortnite-game", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  const stage = backgroundStage(context.season, context.build);
  const motd = {
    entryType: "Website",
    image: "",
    tileImage: "",
    videoMute: false,
    hidden: false,
    tabTitleOverride: "Versa",
    _type: "CommonUI Simple Message MOTD",
    title: "Versa",
    body: "Universal Fortnite backend base",
    videoLoop: false,
    videoStreamingEnabled: false,
    sortingPriority: 0,
    id: "VersaNewsBR",
    videoAutoplay: false,
    videoFullscreen: false,
    spotlight: false,
    websiteURL: "",
    websiteButtonText: "",
  };
  const version = c.get("version") as VersionInfo | undefined;
  const clNum = Number(version?.CL || 0) || 0;
  const newsBody: Record<string, unknown> = {
    _type: "Battle Royale News",
    messages: [{ image: "", hidden: false, messagetype: "normal", title: "Versa", body: "Universal Fortnite backend base" }],
    motds: [motd],
    platform_messages: [],
  };
  if (clNum === 0 || clNum < 3757339) {
    newsBody.message = { hidden: false, _type: "CommonUI Simple Message Base", title: "Versa", body: "Universal Fortnite backend base" };
  }
  const playlistInfo = {
    frontend_matchmaking_header_style: "None",
    playlist_info: {
      playlists: [
        { image: "", playlist_name: "Playlist_DefaultSolo", _type: "FortPlaylistInfo" },
        { image: "", playlist_name: "Playlist_DefaultDuo", _type: "FortPlaylistInfo" },
        { image: "", playlist_name: "Playlist_DefaultSquad", _type: "FortPlaylistInfo" },
      ],
      _type: "FortPlaylistInfo",
    },
  };
  const subgameSelect = {
    battleRoyale: { message: { title: { en: "Battle Royale" }, body: { en: "Drop in and fight to be the last one standing." }, image: "" } },
    saveTheWorld: { message: { title: { en: "Save the World" }, body: { en: "Fight off hordes of monsters in co-op." }, image: "" } },
    creative: { message: { title: { en: "Creative" }, body: { en: "Build your own worlds." }, image: "" } },
    saveTheWorldUnowned: { message: { title: { en: "Save the World" }, body: { en: "Fight off hordes of monsters in co-op." }, image: "" } },
  };
  return c.json({
    _title: "Fortnite Game",
    _activeDate: context._activeDate,
    _lastModified: context._lastModified,
    lastModified: context._lastModified,
    _locale: "en",
    emergencynotice: {
      news: { _type: "Battle Royale News", messages: [{ image: "", hidden: false, messagetype: "normal", title: "Versa", body: "Universal Fortnite backend base" }], platform_motds: [], platform_messages: [] },
      _title: "emergencynotice",
      _noIndex: false,
      alwaysShow: true,
      _activeDate: context._activeDate,
      lastModified: context._lastModified,
      _locale: "en",
    },
    emergencynoticev2: {
      _title: "emergencynoticev2",
      _noIndex: false,
      emergencynotices: { _type: "Emergency Notices", emergencynotices: [{ hidden: false, _type: "CommonUI Emergency Notice Base", title: "Versa", body: "Universal Fortnite backend base" }] },
      _activeDate: context._activeDate,
      lastModified: context._lastModified,
      _locale: "en",
    },
    battleroyalenews: { news: newsBody, _title: "battleroyalenews", header: "", style: "None", _noIndex: false, alwaysShow: false, _activeDate: context._activeDate, lastModified: context._lastModified, _locale: "en" },
    battleroyalenewsv2: { news: newsBody, _title: "battleroyalenewsv2", header: "", style: "None", _noIndex: false, alwaysShow: false, _activeDate: context._activeDate, lastModified: context._lastModified, _locale: "en" },
    savetheworldnews: { news: { _type: "Save the World News", messages: [{ image: "", hidden: false, messagetype: "normal", title: "Versa", body: "Save the World is available" }], motds: [], platform_messages: [] }, _title: "savetheworldnews", header: "", style: "None", _noIndex: false, alwaysShow: false, _activeDate: context._activeDate, lastModified: context._lastModified, _locale: "en" },
    creativenews: { news: { _type: "Creative News", messages: [{ image: "", hidden: false, messagetype: "normal", title: "Versa", body: "Creative mode is available" }], motds: [], platform_messages: [] }, _title: "creativenews", header: "", style: "None", _noIndex: false, alwaysShow: false, _activeDate: context._activeDate, lastModified: context._lastModified, _locale: "en" },
    loginmessage: {
      _title: "LoginMessage",
      loginmessage: { _type: "CommonUI Simple Message", message: { _type: "CommonUI Simple Message Base", title: "Versa", body: "Universal Fortnite backend base" } },
      _activeDate: context._activeDate,
      lastModified: context._lastModified,
      _locale: "en",
      _templateName: "FortniteGameMOTD",
    },
    subgameinfo: {
      battleroyale: { image: "" },
      savetheworld: { image: "" },
      creative: { image: "" },
    },
    dynamicbackgrounds: {
      _title: "dynamicbackgrounds",
      _noIndex: false,
      _activeDate: context._activeDate,
      lastModified: context._lastModified,
      _locale: "en",
      backgrounds: {
        _type: "DynamicBackgroundList",
        backgrounds: [
          { stage, _type: "DynamicBackground", key: "lobby" },
          { stage, _type: "DynamicBackground", key: "vault" },
        ],
      },
    },
    shopSections: { _title: "shop-sections", _noIndex: false, _activeDate: context._activeDate, lastModified: context._lastModified, _locale: "en", sectionList: { _type: "ShopSectionList", sections: [{ _type: "ShopSection", landingPriority: 70, bHidden: false, sectionId: "Featured", bShowTimer: true, sectionDisplayName: "Featured", bShowIneligibleOffers: true }, { _type: "ShopSection", landingPriority: 60, bHidden: false, sectionId: "Daily", bShowTimer: true, sectionDisplayName: "Daily", bShowIneligibleOffers: true }] } },
    tournamentinformation: { _title: "tournamentinformation", _noIndex: false, _activeDate: context._activeDate, lastModified: context._lastModified, _locale: "en" },
    playlistinformation: { _title: "playlistinformation", _noIndex: false, _activeDate: context._activeDate, lastModified: context._lastModified, _locale: "en", ...playlistInfo },
    playlistimages: {
      _title: "playlistimages",
      _noIndex: false,
      _activeDate: context._activeDate,
      lastModified: context._lastModified,
      _locale: "en",
      playlistimages: {
        images: [
          { image: "", _type: "PlaylistImageEntry", playlistname: "Playlist_DefaultSolo" },
          { image: "", _type: "PlaylistImageEntry", playlistname: "Playlist_DefaultDuo" },
          { image: "", _type: "PlaylistImageEntry", playlistname: "Playlist_DefaultSquad" },
        ],
      },
    },
    survivalmessage: {
      _title: "survivalmessage",
      overrideablemessage: { _type: "CommonUI Simple Message", message: { _type: "CommonUI Simple Message Base", title: "Versa", body: "Universal Fortnite backend base" } },
      _activeDate: context._activeDate,
      lastModified: context._lastModified,
      _locale: "en",
    },
    athenamessage: {
      _title: "athenamessage",
      overrideablemessage: { _type: "CommonUI Simple Message", message: { image: "", _type: "CommonUI Simple Message Base", title: "Versa", body: "Universal Fortnite backend base" } },
      _activeDate: context._activeDate,
      lastModified: context._lastModified,
      _locale: "en",
    },
    subgameselectdata: subgameSelect,
    lobby: { stage, backgroundimage: "" },
  });
});

app.get("/content/api/pages/fortnite-game/news", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({
    _title: "News",
    ...context,
    news: {
      messages: [],
      season: context.season,
      build: context.build,
    },
  });
});

app.get("/content/api/pages/fortnite-game/spark-tracks", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({ _title: "Spark Tracks", ...context, sparkTracks: [] });
});

app.get("/content/api/pages/fortnite-game/seasonpasses", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({ _title: "Season Passes", ...context, seasonPasses: [] });
});

app.get("/content/api/pages/fortnite-game/radio-stations", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({ _title: "Radio Stations", ...context, stations: [] });
});

app.get("/content/api/pages/fortnite-game/current-storefront", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({
    _title: "Current Storefront",
    ...context,
    storefront: {
      catalogId: context.catalog.catalogId,
      activationDate: context.catalog.activationDate,
      expirationDate: context.catalog.expirationDate,
      storefronts: context.catalog.storefronts,
    },
  });
});

app.get("/content/api/pages/fortnite-game/*", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({ _title: "Fortnite", ...context });
});

export default app;
