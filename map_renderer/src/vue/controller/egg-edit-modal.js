import {
  eggEditModal,
  eggEditForm,
  eggEditTitle,
  eggEditIdInput,
  eggEditWarning,
  eggEditCloseButton,
  eggEditNote
} from "./dom-elements.js";

export function penIconSvg() {
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.9 2.1a1.8 1.8 0 112.5 2.5L6 12H3.5V9.5l7.4-7.4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.7 3.3l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
}

export function openEggEditModal(item, warningMessage) {
  eggEditTitle.textContent = item.egg?.type === "teleport-destination" ? "Edit Teleport Destination" : "Edit Teleporter";
  eggEditIdInput.value = String(item.egg?.labelId ?? "");
  eggEditForm.dataset.itemId = item.id;
  eggEditNote.textContent = item.egg?.type === "teleport-destination"
    ? "For destination eggs this edits the destination egg's own ID. The change stays in memory and is included in exported JSON and map binary output."
    : "This edits the teleporter's target ID in memory and includes the change in exported JSON and map binary output.";
  setEggEditModalWarning(warningMessage);
  eggEditModal.hidden = false;
  eggEditIdInput.focus();
  eggEditIdInput.select();
}

export function closeEggEditModal() {
  eggEditModal.hidden = true;
  eggEditForm.dataset.itemId = "";
  setEggEditModalWarning("");
}

export function setEggEditModalWarning(message) {
  eggEditWarning.hidden = !message;
  eggEditWarning.textContent = message;
}

export function initEggEditModal({ onSubmit, onInput, onClose }) {
  eggEditForm.addEventListener("submit", onSubmit);
  eggEditIdInput.addEventListener("input", onInput);
  eggEditCloseButton.addEventListener("click", onClose);
  eggEditModal.addEventListener("click", (event) => {
    if (event.target === eggEditModal) {
      onClose();
    }
  });
}