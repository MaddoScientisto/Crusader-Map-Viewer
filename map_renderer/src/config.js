import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const APP_ROOT = path.resolve(__dirname, "..");
export const PUBLIC_ROOT = path.join(APP_ROOT, "src", "public");
export const VUE_DIST_ROOT = path.join(APP_ROOT, "dist-vue");
export const TILE_SIZE = Number.parseInt(process.env.TILE_SIZE ?? "1024", 10);
export const ATLAS_MAX_SIZE = Number.parseInt(process.env.ATLAS_MAX_SIZE ?? "4096", 10);
export const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
export const CACHE_ROOT = path.join(APP_ROOT, ".cache");
export const TILE_CACHE_ROOT = path.join(CACHE_ROOT, "tiles");
export const SCENE_CACHE_ROOT = path.join(CACHE_ROOT, "scene-cache");
export const NPC_SPAWNER_CACHE_FILE = path.join(CACHE_ROOT, "npc-spawner-data.generated.json");
export const MISSION_MAP_CACHE_FILE = path.join(CACHE_ROOT, "mission-map-data.generated.json");
export const CATALOG_ROOT = path.join(APP_ROOT, "Catalogs");
export const TABLES_ROOT = path.join(APP_ROOT, "..", "tables");
export const STATIC_SITE_ROOT = path.join(APP_ROOT, "site");
export const GAMES = [
  {
    id: "remorse",
    label: "No Remorse",
    staticDir: process.env.REMORSE_STATIC_DIR || path.join(APP_ROOT, "STATIC")
  },
  {
    id: "regret",
    label: "No Regret",
    staticDir: process.env.REGRET_STATIC_DIR || path.join(APP_ROOT, "STATIC_REGRET")
  }
];
