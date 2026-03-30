function createDefaultState() {
  return {
    version: 0,
    visible: false,
    itemId: "",
    title: "Edit Teleport Egg",
    teleportId: "",
    note: "",
    warning: "",
    onSubmit: null,
    onValidate: null
  };
}

let eggEditState = createDefaultState();
const listeners = new Set();

function emit() {
  for (const listener of listeners) {
    listener(eggEditState);
  }
}

export function getEggEditState() {
  return eggEditState;
}

export function subscribeEggEditState(listener) {
  listeners.add(listener);
  listener(eggEditState);
  return () => {
    listeners.delete(listener);
  };
}

export function openEggEditState(nextState) {
  eggEditState = {
    ...createDefaultState(),
    ...nextState,
    visible: true,
    version: eggEditState.version + 1
  };
  emit();
}

export function openEggEditModal(item, warningMessage, handlers = {}) {
  openEggEditState({
    itemId: item.id,
    title: item.egg?.type === "teleport-destination" ? "Edit Teleport Destination" : "Edit Teleporter",
    teleportId: String(item.egg?.labelId ?? ""),
    note: item.egg?.type === "teleport-destination"
      ? "For destination eggs this edits the destination egg's own ID. The change stays in memory and is included in exported JSON and map binary output."
      : "This edits the teleporter's target ID in memory and includes the change in exported JSON and map binary output.",
    warning: String(warningMessage ?? ""),
    onSubmit: handlers.onSubmit ?? null,
    onValidate: handlers.onValidate ?? null
  });
}

export function setEggEditWarning(message) {
  eggEditState = {
    ...eggEditState,
    warning: String(message ?? ""),
    version: eggEditState.version + 1
  };
  emit();
}

export const setEggEditModalWarning = setEggEditWarning;

export function closeEggEditState() {
  eggEditState = {
    ...createDefaultState(),
    version: eggEditState.version + 1
  };
  emit();
}

export const closeEggEditModal = closeEggEditState;

export function isEggEditOpen() {
  return eggEditState.visible;
}
