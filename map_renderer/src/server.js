import express from "express";
import fs from "node:fs";
import path from "node:path";

import { APP_ROOT, NPC_SPAWNER_CACHE_FILE, PORT, PUBLIC_ROOT } from "./config.js";
import { BuildManager } from "./lib/build-manager.js";
import { detectCatalog, getGameConfig, getShapeCatalogFile, updateShapeCatalogEntry } from "./lib/catalog.js";

const app = express();
const catalog = detectCatalog();
const builds = new BuildManager(catalog);
const catalogEditingEnabled = process.env.MAP_RENDERER_CATALOG_EDITING === "true";
const vueDistRoot = path.join(APP_ROOT, "dist-vue");
const vueIndexFile = path.join(vueDistRoot, "index.html");
const preferredStaticRoot = fs.existsSync(vueIndexFile) ? vueDistRoot : PUBLIC_ROOT;

function dynamicSiteConfig() {
  return {
    mode: "dynamic",
    npcSpawnerDataUrl: "./api/npc-spawner-data",
    capabilities: {
      reload: true,
      catalogEditing: catalogEditingEnabled
    }
  };
}

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.get("/site-config.json", (_request, response) => {
  response.json(dynamicSiteConfig());
});
app.use(express.static(preferredStaticRoot, { extensions: ["html"] }));
if (preferredStaticRoot !== PUBLIC_ROOT) {
  app.use(express.static(PUBLIC_ROOT, { extensions: ["html"] }));
}

app.get("/api/npc-spawner-data", (_request, response) => {
  if (!fs.existsSync(NPC_SPAWNER_CACHE_FILE)) {
    response.status(404).json({ error: "NPC spawner cache missing. Run build-cache or export-static first." });
    return;
  }
  response.type("application/json");
  response.sendFile(path.resolve(NPC_SPAWNER_CACHE_FILE), { dotfiles: "allow" });
});

app.get("/api/maps", (_request, response) => {
  response.json(builds.listCatalog());
});

app.post("/api/builds", async (request, response) => {
  try {
    const game = String(request.body?.game ?? "");
    const mapId = Number.parseInt(String(request.body?.mapId ?? ""), 10);
    const gameConfig = getGameConfig(game);
    if (!gameConfig) {
      response.status(400).json({ error: "Unknown game id" });
      return;
    }
    if (!Number.isInteger(mapId) || mapId < 0) {
      response.status(400).json({ error: "Invalid map id" });
      return;
    }
    const job = await builds.createOrReuseBuild(gameConfig, mapId);
    response.status(202).json(builds.getPublicJob(job));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/builds/:id", (request, response) => {
  const job = builds.getJob(request.params.id);
  if (!job) {
    response.status(404).json({ error: "Unknown build id" });
    return;
  }
  response.json(builds.getPublicJob(job));
});

app.get("/api/maps/:game/:mapId/metadata", (request, response) => {
  try {
    const buildId = String(request.query.buildId ?? "");
    const mapId = Number.parseInt(request.params.mapId, 10);
    const metadata = builds.getMetadata(buildId, request.params.game, mapId);
    response.json(metadata);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/maps/:game/:mapId/scene", (request, response) => {
  try {
    const buildId = String(request.query.buildId ?? "");
    const mapId = Number.parseInt(request.params.mapId, 10);
    const scene = builds.getSceneData(buildId, request.params.game, mapId);
    response.json(scene);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/maps/:game/:mapId/inspect", (request, response) => {
  try {
    const buildId = String(request.query.buildId ?? "");
    const mapId = Number.parseInt(request.params.mapId, 10);
    const inspect = builds.getInspectData(buildId, request.params.game, mapId);
    response.json(inspect);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/maps/:game/:mapId/overlays", (request, response) => {
  try {
    const buildId = String(request.query.buildId ?? "");
    const mapId = Number.parseInt(request.params.mapId, 10);
    const overlays = builds.getOverlayData(buildId, request.params.game, mapId);
    response.json(overlays);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/maps/:game/:mapId/atlases/:atlasId.png", (request, response) => {
  try {
    const buildId = String(request.query.buildId ?? "");
    const mapId = Number.parseInt(request.params.mapId, 10);
    const atlas = builds.getAtlas(buildId, request.params.game, mapId, request.params.atlasId);
    response.setHeader("Content-Type", "image/png");
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.end(atlas);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/catalogs/:game.csv", (request, response) => {
  const filePath = getShapeCatalogFile(request.params.game);
  if (!filePath) {
    response.status(404).json({ error: "Unknown game id" });
    return;
  }
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
  response.sendFile(path.resolve(filePath), { dotfiles: "allow" }, (error) => {
    if (!error) {
      return;
    }
    if (!response.headersSent) {
      response.status(404).json({ error: "Catalog CSV not found" });
    }
  });
});

if (catalogEditingEnabled) {
  app.post("/api/catalogs/:game/entries/:shapeCode", (request, response) => {
    try {
      const gameConfig = getGameConfig(request.params.game);
      if (!gameConfig) {
        response.status(404).json({ error: "Unknown game id" });
        return;
      }

      const updated = updateShapeCatalogEntry(gameConfig.id, request.params.shapeCode, {
        humanReadableId: request.body?.humanReadableId,
        description: request.body?.description,
        roof: request.body?.roof,
        semitransparency: request.body?.semitransparency,
        oob: request.body?.oob
      });
      const invalidation = builds.invalidateGameCache(gameConfig.id);
      response.json({
        ok: true,
        mode: "admin",
        entry: updated.entry,
        invalidation
      });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, games: catalog.games.length, catalogEditing: catalogEditingEnabled });
});

app.listen(PORT, () => {
  const mode = catalogEditingEnabled ? "admin" : "read-only";
  console.log(`Crusader map renderer listening on http://localhost:${PORT} (${mode} mode)`);
});