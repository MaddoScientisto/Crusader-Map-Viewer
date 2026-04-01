import {
  includeEditorCheckbox,
  includeRoofsCheckbox,
  includeOobCheckbox,
  alwaysShowRangesCheckbox,
  showF7GridCheckbox,
  showAltF7SnapRangesCheckbox,
  showCtrlF7EggRangesCheckbox,
  showBoundingBoxesCheckbox,
  spinner,
  progressWrap,
  progressFill,
  statusBox,
  metaBox,
  notificationToast,
  zoomLabel,
  reloadMapButton,
  zoomInButton,
  zoomOutButton,
  zoomResetButton,
  zoomFitButton,
  downloadButton,
  downloadSceneJsonButton,
  downloadMapBinaryButton,
  downloadAtlasButton,
  hiddenExportButton,
  emptyState
} from "./dom-elements.js";
import { state } from "./state.js";
import { isStaticMode, phaseProgress } from "../../public/helpers.js";

export function showToast(message) {
  if (!notificationToast) {
    return;
  }
  notificationToast.textContent = message;
  notificationToast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    notificationToast.hidden = true;
  }, 3600);
}

function canReloadCurrentMode() {
  return !isStaticMode() && state.siteConfig?.capabilities?.reload !== false;
}

export function setEmptyStateVisible(visible) {
  emptyState.hidden = !visible;
  emptyState.classList.toggle("is-hidden", !visible);
}

export function setStatus(message) {
  statusBox.textContent = message;
}

export function setLoadingState(active, build = null) {
  spinner.hidden = !active;
  progressWrap.hidden = !active;
  progressFill.style.width = active ? `${phaseProgress(build)}%` : "0%";
}

export function setMeta(metadata) {
  if (!metadata) {
    metaBox.innerHTML = '<p class="meta-empty">Select a map to see render metadata.</p>';
    return;
  }

  const fingerprintRow = metadata.buildFingerprint
    ? `<dt>Fingerprint</dt><dd>${metadata.buildFingerprint}</dd>`
    : "";
  const kindSummary = Object.entries(metadata.sceneSummary?.kindCounts ?? {})
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([kind, count]) => `${kind}: ${count}`)
    .join(", ");
  const topFamilies = (metadata.sceneSummary?.topFamilies ?? [])
    .map((entry) => `family ${entry.family} (${entry.count})`)
    .join(", ");

  metaBox.innerHTML = `
    <section class="meta-section">
      <h2 class="meta-title">Overview</h2>
      <dl class="meta-grid">
        <dt>Game</dt><dd>${metadata.gameLabel}</dd>
        <dt>Map</dt><dd>${metadata.map}</dd>
        <dt>Bounds</dt><dd>${metadata.bounds.width} x ${metadata.bounds.height}</dd>
        ${fingerprintRow}
      </dl>
    </section>
    <section class="meta-section">
      <h2 class="meta-title">Scene</h2>
      <dl class="meta-grid">
        <dt>Raw items</dt><dd>${metadata.rawItemCount}</dd>
        <dt>Renderables</dt><dd>${metadata.itemCount}</dd>
        <dt>Painted items</dt><dd>${metadata.paintedItemCount}</dd>
        <dt>Atlases</dt><dd>${metadata.sceneSummary?.atlasCount ?? 0}</dd>
        <dt>Unique sprites</dt><dd>${metadata.sceneSummary?.spriteCount ?? 0}</dd>
        <dt>Occluded</dt><dd>${metadata.occludedItemCount}</dd>
        <dt>Invalid</dt><dd>${metadata.invalidItemCount}</dd>
      </dl>
    </section>
    <section class="meta-section">
      <h2 class="meta-title">Families</h2>
      <dl class="meta-grid">
        <dt>Helper geometry</dt><dd>${metadata.sceneSummary?.helperCount ?? 0}</dd>
        <dt>Shape definitions</dt><dd>${state.current?.shapeDefinitions.size ?? 0}</dd>
        <dt>Kinds</dt><dd>${kindSummary || "None"}</dd>
        <dt>Top families</dt><dd>${topFamilies || "None"}</dd>
      </dl>
    </section>
    <section class="meta-section">
      <h2 class="meta-title">View</h2>
      <dl class="meta-grid">
        <dt>Editor-only</dt><dd>${includeEditorCheckbox.checked ? "Shown" : "Hidden"}</dd>
        <dt>F7 grid</dt><dd>${showF7GridCheckbox.checked ? "Shown" : "Hidden"}</dd>
        <dt>Alt+F7</dt><dd>${showAltF7SnapRangesCheckbox.checked ? "Shown" : "Hidden"}</dd>
        <dt>Ctrl+F7</dt><dd>${showCtrlF7EggRangesCheckbox.checked ? "Shown" : "Hidden"}</dd>
        <dt>Legacy ranges</dt><dd>${alwaysShowRangesCheckbox.checked ? "Shown" : "Hidden"}</dd>
        <dt>Roofs</dt><dd>${includeRoofsCheckbox.checked ? "Shown" : "Hidden"}</dd>
        <dt>Out-of-bounds</dt><dd>${includeOobCheckbox.checked ? "Shown" : "Hidden"}</dd>
        <dt>Bounding boxes</dt><dd>${showBoundingBoxesCheckbox.checked ? "Shown" : "Hidden"}</dd>
        <dt>Empty map</dt><dd>${metadata.isEmpty ? "Yes" : "No"}</dd>
      </dl>
      ${metadata.emptyReason ? `<p class="muted">${metadata.emptyReason}</p>` : ""}
    </section>
  `;
}

export function enableZoomControls(enabled) {
  zoomInButton.disabled = !enabled;
  zoomOutButton.disabled = !enabled;
  zoomResetButton.disabled = !enabled;
  zoomFitButton.disabled = !enabled;
}

export function setDownloadState(enabled) {
  downloadButton.classList.toggle("is-disabled", !enabled);
  downloadButton.setAttribute("aria-disabled", String(!enabled));
  downloadButton.disabled = !enabled;
}

export function setSceneJsonDownloadState(enabled) {
  downloadSceneJsonButton.classList.toggle("is-disabled", !enabled);
  downloadSceneJsonButton.setAttribute("aria-disabled", String(!enabled));
  downloadSceneJsonButton.disabled = !enabled;
}

export function setMapBinaryDownloadState(enabled) {
  downloadMapBinaryButton.classList.toggle("is-disabled", !enabled);
  downloadMapBinaryButton.setAttribute("aria-disabled", String(!enabled));
  downloadMapBinaryButton.disabled = !enabled;
}

export function setAtlasDownloadState(enabled, atlasCount = 0) {
  downloadAtlasButton.classList.toggle("is-disabled", !enabled);
  downloadAtlasButton.setAttribute("aria-disabled", String(!enabled));
  downloadAtlasButton.disabled = !enabled;
  downloadAtlasButton.textContent = atlasCount > 1 ? `Download ${atlasCount} Atlas PNGs` : "Download Atlas PNG";
}

export function setHiddenExportState(enabled) {
  hiddenExportButton.classList.toggle("is-disabled", !enabled);
  hiddenExportButton.setAttribute("aria-disabled", String(!enabled));
  hiddenExportButton.disabled = !enabled;
}

export function setReloadState(enabled) {
  const allowed = canReloadCurrentMode() && enabled;
  reloadMapButton.classList.toggle("is-disabled", !allowed);
  reloadMapButton.setAttribute("aria-disabled", String(!allowed));
  reloadMapButton.disabled = !allowed;
  reloadMapButton.title = canReloadCurrentMode() ? "Reload current map" : "Reload unavailable in static mode";
}

export function updateZoomLabel() {
  zoomLabel.textContent = `Zoom: ${Math.round(state.zoom * 100)}%`;
}
