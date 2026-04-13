export const CATALOG_SURFACE_TYPES = Object.freeze(["floor", "wall", "object"]);

const CATALOG_SURFACE_TYPE_LABELS = Object.freeze({
  floor: "Floor",
  wall: "Wall",
  object: "Object"
});

export function normalizeCatalogSurfaceType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CATALOG_SURFACE_TYPES.includes(normalized) ? normalized : "";
}

export function parseEditableCatalogSurfaceType(value, fieldName = "Surface type") {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const normalized = normalizeCatalogSurfaceType(value);
  if (normalized) {
    return normalized;
  }
  throw new Error(`${fieldName} must be floor, wall, object, or auto`);
}

export function formatCatalogSurfaceTypeLabel(value) {
  const normalized = normalizeCatalogSurfaceType(value);
  return CATALOG_SURFACE_TYPE_LABELS[normalized] ?? "Auto";
}
