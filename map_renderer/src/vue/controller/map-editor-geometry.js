const MAX_MAP_COORDINATE = 0x1fffe;
const GIZMO_AXES = Object.freeze({
  x: { screenX: 42, screenY: 21, worldSpan: 168 },
  y: { screenX: -42, screenY: 21, worldSpan: 168 },
  z: { screenX: 0, screenY: -48, worldSpan: 48 }
});
const GIZMO_ARROW_HEAD_LENGTH = 8;
const HOVERED_GIZMO_ARROW_HEAD_LENGTH = 10;

export function isEditorEditableItem(item) {
  return item?.source === "fixed" && Number.isInteger(item.mapSourceIndex);
}

export function isEditorSelectableItem(item) {
  return isEditorEditableItem(item);
}

export function isItemInEditorLayer(item, layer) {
  return (layer === "fixed" || layer === "glob") && item?.source === layer;
}

export function getGizmoArrowHeadLength(axis, hoveredAxis) {
  return axis === hoveredAxis ? HOVERED_GIZMO_ARROW_HEAD_LENGTH : GIZMO_ARROW_HEAD_LENGTH;
}

function roundToEven(value) {
  return Math.round(value / 2) * 2;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function scenePointToMapWorld(point, z, bounds = {}) {
  const screenX = point.x + (bounds.screenLeft ?? 0);
  const screenY = point.y + (bounds.screenTop ?? 0) + z;
  return {
    x: clamp(roundToEven(2 * screenX + 4 * screenY), 0, MAX_MAP_COORDINATE),
    y: clamp(roundToEven(4 * screenY - 2 * screenX), 0, MAX_MAP_COORDINATE),
    z: clamp(Math.round(z), 0, 0xff)
  };
}

export function mapWorldToScenePoint(world, bounds = {}) {
  return {
    x: world.x / 4 - world.y / 4 - (bounds.screenLeft ?? 0),
    y: world.x / 8 + world.y / 8 - world.z - (bounds.screenTop ?? 0)
  };
}

export function snapMapPosition(position, enabled, gridSize) {
  const size = Number.isInteger(gridSize) && gridSize > 0 ? gridSize : 2;
  const snap = (value) => enabled ? Math.round(value / size) * size : value;
  return {
    x: clamp(roundToEven(snap(position.x)), 0, MAX_MAP_COORDINATE),
    y: clamp(roundToEven(snap(position.y)), 0, MAX_MAP_COORDINATE),
    z: clamp(Math.round(snap(position.z)), 0, 0xff)
  };
}

export function getGizmoAxes(center) {
  return Object.fromEntries(Object.entries(GIZMO_AXES).map(([axis, descriptor]) => [
    axis,
    {
      start: center,
      end: {
        x: center.x + descriptor.screenX,
        y: center.y + descriptor.screenY
      },
      color: axis === "x" ? "#f05a70" : axis === "y" ? "#a3d447" : "#4096e8"
    }
  ]));
}

export function getSelectionGizmoCenter(items, selectedIds, zoom = 1, offsetX = 0, offsetY = 0) {
  const selected = items.filter((item) => (
    selectedIds.has(item.id)
    && Number.isFinite(item.screen?.left)
    && Number.isFinite(item.screen?.right)
    && Number.isFinite(item.screen?.top)
    && Number.isFinite(item.screen?.bottom)
  ));
  if (selected.length === 0) {
    return null;
  }
  const center = selected.reduce((point, item) => ({
    x: point.x + (item.screen.left + item.screen.right) / 2,
    y: point.y + (item.screen.top + item.screen.bottom) / 2
  }), { x: 0, y: 0 });
  return {
    x: center.x / selected.length * zoom + offsetX,
    y: center.y / selected.length * zoom + offsetY
  };
}

function distanceToSegment(point, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const ratio = clamp(((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + ratio * deltaX), point.y - (start.y + ratio * deltaY));
}

export function hitTestGizmoAxis(point, center, tolerance = 9) {
  const axes = getGizmoAxes(center);
  const matches = Object.entries(axes)
    .map(([axis, geometry]) => ({ axis, distance: distanceToSegment(point, geometry.start, geometry.end) }))
    .filter((entry) => entry.distance <= tolerance)
    .sort((left, right) => left.distance - right.distance);
  return matches[0]?.axis ?? null;
}

export function getGizmoAxisWorldDelta(axis, deltaX, deltaY, zoom = 1) {
  const descriptor = GIZMO_AXES[axis];
  if (!descriptor) {
    return 0;
  }
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const screenDeltaX = deltaX / safeZoom;
  const screenDeltaY = deltaY / safeZoom;
  const projectedLengthSquared = descriptor.screenX ** 2 + descriptor.screenY ** 2;
  const projectedDistance = (screenDeltaX * descriptor.screenX + screenDeltaY * descriptor.screenY) / projectedLengthSquared;
  return projectedDistance * descriptor.worldSpan;
}