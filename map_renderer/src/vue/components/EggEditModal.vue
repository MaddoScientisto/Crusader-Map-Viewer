<template>
  <div id="egg-edit-modal" class="modal-backdrop" hidden>
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="egg-edit-title">
      <div class="modal-header">
        <h2 id="egg-edit-title" class="modal-title">Edit Teleport Egg</h2>
        <button id="egg-edit-close-button" class="tooltip-action modal-close-button" type="button" aria-label="Close egg editor">×</button>
      </div>
      <form id="egg-edit-form" class="tooltip-editor-form modal-form">
        <label class="tooltip-field">
          <span>Teleport ID</span>
          <input id="egg-edit-id-input" class="tooltip-field-input" name="teleportId" type="number" min="0" max="255" step="1">
        </label>
        <p id="egg-edit-note" class="tooltip-editor-note"></p>
        <p id="egg-edit-warning" class="tooltip-warning" hidden></p>
        <button class="tooltip-save-button" type="submit">Save Teleport ID</button>
      </form>
    </div>
  </div>
</template>