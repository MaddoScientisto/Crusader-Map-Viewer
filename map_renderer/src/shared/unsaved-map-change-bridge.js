function createDefaultState(version = 0) {
  return { version, visible: false };
}

let confirmationState = createDefaultState();
let pendingResolve = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) {
    listener(confirmationState);
  }
}

export function getUnsavedMapChangeState() {
  return confirmationState;
}

export function subscribeUnsavedMapChange(listener) {
  listeners.add(listener);
  listener(confirmationState);
  return () => {
    listeners.delete(listener);
  };
}

export function requestUnsavedMapChangeConfirmation() {
  if (pendingResolve) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    pendingResolve = resolve;
    confirmationState = {
      ...createDefaultState(confirmationState.version + 1),
      visible: true
    };
    emit();
  });
}

export function resolveUnsavedMapChangeConfirmation(shouldContinue) {
  const resolve = pendingResolve;
  pendingResolve = null;
  confirmationState = createDefaultState(confirmationState.version + 1);
  emit();
  resolve?.(Boolean(shouldContinue));
}