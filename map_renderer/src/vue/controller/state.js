import { canvas } from "./dom-elements.js";

export const APP_BASE_URL = new URL("./", document.baseURI);
export let context = null;

export function initializeControllerState() {
  if (!canvas) {
    throw new Error("Renderer canvas is unavailable during controller initialization");
  }
  context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("Renderer canvas 2D context could not be created");
  }
}

export const state = {
  catalog: null,
  current: null,
  siteConfig: null,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  buildPollTimer: null,
  buildToken: 0,
  drag: null,
  suppressNextClick: false,
  pointers: new Map(),
  pinch: null,
  hoverItemId: null,
  pinnedItemId: null,
  pendingPinnedItemId: null,
  panelResize: null,
  catalogEditHistory: [],
  undoInFlight: false,
  toastTimer: null,
  lastPointerClient: null,
  eggPlacement: null,
  syntheticItemSerial: 0,
  selectionMemory: {
    byFamily: {},
    byVersion: {}
  },
  viewMemory: {
    byFamily: {},
    byVersion: {}
  },
  highlightOverlay: {
    itemId: null,
    geometry: null,
    fallbackItem: null,
    alpha: 0,
    targetAlpha: 0,
    lastTimestamp: 0
  }
};

export const ZOOM_FACTOR = 1.2;
export const FIT_PADDING = 24;
export const DEVICE_PIXEL_RATIO = Math.max(1, window.devicePixelRatio || 1);
export const EXPORT_BACKGROUND = "#0a0c12";
