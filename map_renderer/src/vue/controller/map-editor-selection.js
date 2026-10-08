export function clearMapEditorSelectionState(state) {
  state.editor.selectedIds.clear();
  state.editor.globSelection = null;
  state.editor.globHover = null;
  state.editor.hoverAxis = null;
  state.pinnedItemId = null;
  state.hoverItemId = null;
}