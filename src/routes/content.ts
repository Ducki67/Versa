import { Hono } from "hono";

const app = new Hono();

app.get("/content/api/pages/fortnite-game", (c) => c.json({ _title: "Fortnite Game", _activeDate: "2024-01-01T00:00:00.000Z", _locale: "en" }));

app.get("/content/api/pages/fortnite-game/news", (c) => c.json({ _title: "News", news: { messages: [] } }));

app.get("/content/api/pages/fortnite-game/spark-tracks", (c) => c.json({ _title: "Spark Tracks", _activeDate: "2024-01-01T00:00:00.000Z", _locale: "en", sparkTracks: [] }));

app.get("/content/api/pages/fortnite-game/current-storefront", (c) => c.json({}));

app.get("/content/api/pages/fortnite-game/*", (c) => c.json({ _title: "Fortnite", _activeDate: "2024-01-01T00:00:00.000Z", _locale: "en" }));

export default app;
