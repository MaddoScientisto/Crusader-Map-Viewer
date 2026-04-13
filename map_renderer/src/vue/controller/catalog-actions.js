export function createCatalogActions(dependencies) {
  const {
    state,
    decodeCatalogBoolean,
    cloneCatalogSnapshot,
    catalogSnapshotsEqual,
    listChangedCatalogFields,
    formatUndoSummary,
    fetchJson,
    getCatalogUpdateUrl,
    getShapeDefinition,
    getItemById,
    canEditCatalog,
    startBuild,
    showToast,
    setStatus,
    normalizeCatalogSurfaceType
  } = dependencies;

  async function saveCatalogEntry(item, payload) {
    if (!state.current) {
      return;
    }
    const definition = getShapeDefinition(item.shapeDefId);
    if (!definition) {
      throw new Error("No shape definition is available for this item");
    }
    const previousSnapshot = cloneCatalogSnapshot(definition.catalogEntry);

    const normalizedPayload = {
      humanReadableId: String(payload?.humanReadableId ?? "").trim(),
      description: String(payload?.description ?? "").trim(),
      roof: decodeCatalogBoolean(String(payload?.roof ?? "")),
      semitransparency: decodeCatalogBoolean(String(payload?.semitransparency ?? "")),
      oob: decodeCatalogBoolean(String(payload?.oob ?? "")),
      surfaceType: normalizeCatalogSurfaceType(payload?.surfaceType)
    };
    if (catalogSnapshotsEqual(previousSnapshot, normalizedPayload)) {
      setStatus(`No catalog changes to save for ${definition.shapeHex}.`);
      return;
    }

    setStatus(`Saving ${definition.shapeHex} to the ${state.current.selected.game} catalog...`);
    const result = await fetchJson(getCatalogUpdateUrl(state.current.selected.game, definition.shape), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizedPayload)
    });
    state.catalogEditHistory.push({
      game: state.current.selected.game,
      shape: definition.shape,
      shapeHex: definition.shapeHex,
      label: result.entry?.humanReadableId || previousSnapshot.humanReadableId || definition.shapeHex,
      before: previousSnapshot,
      after: cloneCatalogSnapshot(result.entry ?? normalizedPayload)
    });
    state.pendingPinnedItemId = item.id;
    await startBuild(state.current.selected);
    const savedLabel = result.entry?.humanReadableId || definition.displayName || definition.shapeHex;
    showToast(`Saved catalog entry for ${savedLabel}.`);
  }

  async function undoLastCatalogEdit() {
    if (!canEditCatalog() || state.undoInFlight || state.catalogEditHistory.length === 0) {
      return;
    }

    const entry = state.catalogEditHistory.at(-1);
    state.undoInFlight = true;
    try {
      setStatus(`Undoing last catalog edit for ${entry.shapeHex}...`);
      await fetchJson(getCatalogUpdateUrl(entry.game, entry.shape), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.before)
      });
      state.catalogEditHistory.pop();

      if (state.current?.selected?.game === entry.game) {
        const pinnedItem = state.pinnedItemId ? getItemById(state.pinnedItemId) : null;
        const pinnedDefinition = pinnedItem ? getShapeDefinition(pinnedItem.shapeDefId) : null;
        if (pinnedDefinition?.shape === entry.shape && state.pinnedItemId) {
          state.pendingPinnedItemId = state.pinnedItemId;
        }
        await startBuild(state.current.selected);
      }

      const undoneFields = formatUndoSummary(listChangedCatalogFields(entry.before, entry.after));
      const label = entry.label && entry.label !== entry.shapeHex ? `${entry.shapeHex} ${entry.label}` : entry.shapeHex;
      showToast(`Undid catalog edit for ${label}: restored ${undoneFields}.`);
      setStatus(`Undid catalog edit for ${label}.`);
    } finally {
      state.undoInFlight = false;
    }
  }

  return {
    saveCatalogEntry,
    undoLastCatalogEdit
  };
}
