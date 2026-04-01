<template>
  <aside class="panel" id="side-panel">
    <h1>Crusader Map Renderer</h1>
    <p class="lede">Cache-backed atlas scene renderer. Source assets stay server-side while the browser reconstructs each map from packed sprite atlases.</p>

    <form id="map-form" class="stack">
      <label for="version-select">Version</label>
      <select id="version-select" name="version" disabled>
        <option value="">Loading versions...</option>
      </select>
      <label for="map-select">Detected maps</label>
      <select id="map-select" name="map" disabled>
        <option value="">Loading map catalog...</option>
      </select>
      <div class="button-row map-nav-row">
        <button id="map-prev" type="button" disabled>Previous</button>
        <button id="reload-map-button" class="icon-button is-disabled" type="button" aria-disabled="true" aria-label="Reload current map" title="Reload current map">↻</button>
        <button id="map-next" type="button" disabled>Next</button>
      </div>
      <div class="toggle-grid">
        <label class="toggle"><input id="include-editor" type="checkbox" checked> Show editor-only elements</label>
        <div class="toggle-subgrid" aria-label="Editor preview options">
          <label class="toggle toggle-nested"><input id="show-editor-link-arrows" type="checkbox"> Show editor helper arrows</label>
          <label class="toggle toggle-nested"><input id="always-show-ranges" type="checkbox"> Always show ranges</label>
          <label class="toggle toggle-nested"><input id="always-show-npc-previews" type="checkbox"> Always show NPC previews</label>
          <label class="toggle toggle-nested"><input id="always-show-item-previews" type="checkbox"> Always show item previews</label>
        </div>
        <label class="toggle"><input id="include-roofs" type="checkbox"> Show roofs</label>
        <label class="toggle"><input id="include-oob" type="checkbox" checked> Show black out-of-bounds surfaces</label>
        <label class="toggle"><input id="show-bounding-boxes" type="checkbox"> Show white bounding boxes</label>
        <label class="toggle"><input id="show-link-arrows" type="checkbox" checked> Show verified link arrows</label>
        <label class="toggle"><input id="inspect-shapes" type="checkbox"> Inspect shapes under cursor</label>
      </div>
    </form>

    <div class="stack controls">
      <label>View</label>
      <div class="button-row">
        <button id="zoom-out" type="button" disabled>-</button>
        <button id="zoom-reset" type="button" disabled>100%</button>
        <button id="zoom-in" type="button" disabled>+</button>
        <button id="zoom-fit" type="button" disabled>Fit</button>
      </div>
      <div id="zoom-label" class="muted">Zoom: --</div>
      <div class="status">
        <div class="status-row">
          <span id="spinner" class="spinner" hidden></span>
          <div id="status" class="status-text">Idle.</div>
        </div>
        <div id="progress-wrap" class="progress-wrap" hidden>
          <div class="progress-track">
            <div id="progress-fill" class="progress-fill"></div>
          </div>
        </div>
      </div>
      <details class="collapsible-panel" id="egg-section">
        <summary>Eggs <span id="egg-count" class="summary-count">0</span></summary>
        <div class="collapsible-panel-body">
          <label class="toggle"><input id="show-egg-labels" type="checkbox"> Show egg ID labels</label>
          <div class="toggle-grid" id="egg-filters">
            <label class="toggle"><input id="egg-filter-teleport-destination" type="checkbox" checked> Teleport destinations</label>
            <label class="toggle"><input id="egg-filter-teleporter" type="checkbox"> Teleporters</label>
            <label class="toggle"><input id="egg-filter-monster" type="checkbox"> Monster spawns</label>
            <label class="toggle"><input id="egg-filter-usecode" type="checkbox"> Usecode triggers</label>
            <label class="toggle"><input id="egg-filter-glob" type="checkbox"> Glob eggs</label>
          </div>
          <label class="tooltip-field egg-placement-id-field" for="egg-placement-id">
            <span>New teleport ID</span>
            <input id="egg-placement-id" class="tooltip-field-input" type="number" min="0" max="255" step="1" value="1">
          </label>
          <p id="egg-placement-warning" class="egg-placement-warning" hidden></p>
          <div class="button-row egg-placement-button-row">
            <button id="add-egg-button" class="action-link is-disabled" type="button" aria-disabled="true">Add Teleporter</button>
            <button id="add-destination-egg-button" class="action-link is-disabled" type="button" aria-disabled="true">Add Destination</button>
          </div>
          <div id="egg-panel" class="meta-panel">
            <p id="egg-empty" class="meta-empty">Select a map to list its eggs.</p>
            <div id="egg-list" class="egg-list"></div>
          </div>
        </div>
      </details>
      <details class="collapsible-panel" id="monster-spawner-section">
        <summary>Monster Spawners <span id="monster-spawner-count" class="summary-count">0</span></summary>
        <div class="collapsible-panel-body">
          <label class="toggle"><input id="monster-spawner-filter-blocked" type="checkbox"> Show only auto-enter blocked spawners</label>
          <div id="monster-spawner-panel" class="meta-panel">
            <p id="monster-spawner-empty" class="meta-empty">Select a map to list its 0x04D0 spawners.</p>
            <div id="monster-spawner-list" class="egg-list"></div>
          </div>
        </div>
      </details>
      <details class="collapsible-panel">
        <summary>Downloads</summary>
        <div class="collapsible-panel-body">
          <button id="download-button" class="action-link is-disabled" type="button" aria-disabled="true">Download PNG</button>
          <button id="download-scene-json-button" class="action-link is-disabled" type="button" aria-disabled="true">Download Map JSON</button>
          <button id="download-map-binary-button" class="action-link is-disabled" type="button" aria-disabled="true">Download Map Binary</button>
          <button id="download-atlas-button" class="action-link is-disabled" type="button" aria-disabled="true">Download Atlas PNG</button>
          <div id="catalog-export-buttons" class="catalog-export-list"></div>
          <p id="catalog-editing-hint" class="muted catalog-editing-hint" hidden></p>
        </div>
      </details>
    </div>

    <div class="stack">
      <details class="collapsible-panel" id="hidden-shapes-section">
        <summary>Hidden Shapes <span id="hidden-count" class="summary-count">0</span></summary>
        <div class="collapsible-panel-body">
          <button id="hidden-export-button" class="action-link is-disabled" type="button" aria-disabled="true">Export Hidden JSON</button>
          <div id="hidden-panel" class="meta-panel">
            <p id="hidden-empty" class="meta-empty">Hidden shapes will appear here and can be restored individually.</p>
            <div id="hidden-list" class="hidden-list"></div>
          </div>
        </div>
      </details>
    </div>

    <div class="stack">
      <label>Map Metadata</label>
      <div id="meta" class="meta-panel">
        <p class="meta-empty">Select a map to see render metadata.</p>
      </div>
    </div>
  </aside>
</template>