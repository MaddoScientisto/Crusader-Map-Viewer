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
const REMORSE_STATIC_DIR = process.env.REMORSE_STATIC_DIR || path.join(APP_ROOT, "STATIC");
const REMORSE_STATIC_101_DIR = process.env.REMORSE_STATIC_101_DIR || path.join(APP_ROOT, "STATIC_1.01");
const REMORSE_STATIC_DEMO_DIR = process.env.REMORSE_STATIC_DEMO_DIR || path.join(APP_ROOT, "STATIC_DEMO");
const REMORSE_STATIC_JP_DIR = process.env.REMORSE_STATIC_JP_DIR || path.join(APP_ROOT, "STATIC_JP");
const REGRET_STATIC_DIR = process.env.REGRET_STATIC_DIR || path.join(APP_ROOT, "STATIC_REGRET");

export const GAMES = [
  {
    id: "remorse",
    gameId: "remorse",
    versionId: "retail",
    versionLabel: "Retail",
    label: "No Remorse",
    selectorLabel: "No Remorse",
    catalogId: "remorse",
    tableId: "remorse",
    staticDir: REMORSE_STATIC_DIR,
    fallbackStaticDirs: [],
    usecodeFileName: "EUSECODE.FLX",
    supportsMissionMapExtraction: true
  },
  {
    id: "remorse-101",
    gameId: "remorse",
    versionId: "1.01",
    versionLabel: "1.01",
    label: "No Remorse 1.01",
    selectorLabel: "No Remorse 1.01",
    catalogId: "remorse",
    tableId: "remorse",
    staticDir: REMORSE_STATIC_101_DIR,
    fallbackStaticDirs: [REMORSE_STATIC_DIR],
    usecodeFileName: "EUSECODE.FLX",
    supportsMissionMapExtraction: true,
    missionTableAbsoluteFileOffset: 0x0e16c6,
    missionTableEntryCount: 17
  },
  {
    id: "remorse-demo",
    gameId: "remorse",
    versionId: "demo",
    versionLabel: "Demo",
    label: "No Remorse Demo",
    selectorLabel: "No Remorse Demo",
    catalogId: "remorse",
    tableId: "remorse",
    staticDir: REMORSE_STATIC_DEMO_DIR,
    fallbackStaticDirs: [REMORSE_STATIC_DIR],
    usecodeFileName: "EUSECODE.FLX",
    supportsMissionMapExtraction: true,
    missionTableAbsoluteFileOffset: 0x0e3a88,
    missionTableEntryCount: 17
  },
  {
    id: "remorse-jp",
    gameId: "remorse",
    versionId: "jp",
    versionLabel: "Japanese",
    label: "No Remorse Japanese",
    selectorLabel: "No Remorse Japanese",
    catalogId: "remorse",
    tableId: "remorse",
    staticDir: REMORSE_STATIC_JP_DIR,
    fallbackStaticDirs: [REMORSE_STATIC_DIR],
    usecodeFileName: "JUSECODE.FLX",
    supportsMissionMapExtraction: true,
    missionTableBaseMaps: [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 40],
    missionTableAddress: "0x0047b72c",
    missionTableConsumerFunction: "FUN_00428e00",
    missionTableConsumerAddress: "0x00429056"
  },
  {
    id: "regret",
    gameId: "regret",
    versionId: "retail",
    versionLabel: "Retail",
    label: "No Regret",
    selectorLabel: "No Regret",
    catalogId: "regret",
    tableId: "regret",
    staticDir: REGRET_STATIC_DIR,
    fallbackStaticDirs: [],
    usecodeFileName: "EUSECODE.FLX",
    supportsMissionMapExtraction: true
  }
];
