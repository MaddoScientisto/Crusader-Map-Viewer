import { sanitizeUsecodeTarget } from "./usecode-browser.js";

function parseMapId(value) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(numeric) ? numeric : null;
}

function sanitizeHistoryState(rawState = {}) {
  const tab = rawState.tab === "usecode" || rawState.tab === "atlas" ? rawState.tab : "map";
  const game = String(rawState.game ?? "").trim() || null;
  const mapId = parseMapId(rawState.mapId);
  const usecodeTarget = sanitizeUsecodeTarget(rawState.usecodeTarget);
  return {
    game,
    mapId,
    tab,
    usecodeTarget
  };
}

function parseHistoryStateFromUrl() {
  const url = new URL(window.location.href);
  return sanitizeHistoryState({
    game: url.searchParams.get("game"),
    mapId: url.searchParams.get("map"),
    tab: url.searchParams.get("tab"),
    usecodeTarget: url.searchParams.get("ucClass")
      ? {
          className: url.searchParams.get("ucClass"),
          slot: url.searchParams.get("ucSlot"),
          eventNameHint: url.searchParams.get("ucEvent")
        }
      : null
  });
}

function buildHistoryUrl(state) {
  const url = new URL(window.location.href);
  if (state.game) {
    url.searchParams.set("game", state.game);
  } else {
    url.searchParams.delete("game");
  }
  if (Number.isInteger(state.mapId)) {
    url.searchParams.set("map", String(state.mapId));
  } else {
    url.searchParams.delete("map");
  }
  if (state.tab && state.tab !== "map") {
    url.searchParams.set("tab", state.tab);
  } else {
    url.searchParams.delete("tab");
  }
  if (state.usecodeTarget?.className) {
    url.searchParams.set("ucClass", state.usecodeTarget.className);
    if (Number.isInteger(state.usecodeTarget.slot)) {
      url.searchParams.set("ucSlot", String(state.usecodeTarget.slot));
    } else {
      url.searchParams.delete("ucSlot");
    }
    if (state.usecodeTarget.eventNameHint) {
      url.searchParams.set("ucEvent", state.usecodeTarget.eventNameHint);
    } else {
      url.searchParams.delete("ucEvent");
    }
  } else {
    url.searchParams.delete("ucClass");
    url.searchParams.delete("ucSlot");
    url.searchParams.delete("ucEvent");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readViewerHistoryState() {
  const historyState = sanitizeHistoryState(window.history.state ?? {});
  const urlState = parseHistoryStateFromUrl();
  return sanitizeHistoryState({
    ...historyState,
    ...urlState,
    usecodeTarget: urlState.usecodeTarget ?? historyState.usecodeTarget
  });
}

export function getHistorySelection(state = readViewerHistoryState()) {
  if (!state.game || !Number.isInteger(state.mapId)) {
    return null;
  }
  return {
    game: state.game,
    mapId: state.mapId
  };
}

export function updateViewerHistory(partialState, options = {}) {
  const replace = options.replace === true;
  const currentState = readViewerHistoryState();
  const nextState = sanitizeHistoryState({
    ...currentState,
    ...partialState,
    usecodeTarget: Object.prototype.hasOwnProperty.call(partialState ?? {}, "usecodeTarget")
      ? partialState.usecodeTarget
      : currentState.usecodeTarget
  });
  const nextUrl = buildHistoryUrl(nextState);
  const currentUrl = buildHistoryUrl(currentState);
  if (JSON.stringify(nextState) === JSON.stringify(currentState) && nextUrl === currentUrl) {
    return;
  }
  window.history[replace ? "replaceState" : "pushState"](nextState, "", nextUrl);
}