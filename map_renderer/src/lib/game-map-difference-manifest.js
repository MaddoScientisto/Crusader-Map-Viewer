const FIXED_ARCHIVE_VARIANT_MANIFEST = {
  "remorse-jp": {
    compareAgainstGameId: "remorse",
    sourceFileName: "FIXED.DAT",
    comparedSourceSha1: {
      remorse: "4a8cf1ed99996b8b37a3a0fd33acf09c1bb642e5",
      "remorse-jp": "4a8cf1ed99996b8b37a3a0fd33acf09c1bb642e5"
    },
    sameArchiveAsBase: true,
    differingMapIds: []
  }
};

export function getFixedArchiveVariantManifest(gameId) {
  return FIXED_ARCHIVE_VARIANT_MANIFEST[gameId] ?? null;
}

export function filterBrowsableMapsForGame(gameId, maps = []) {
  const manifest = getFixedArchiveVariantManifest(gameId);
  if (!manifest) {
    return maps;
  }

  const differingMapIds = new Set(manifest.differingMapIds ?? []);
  return maps.filter((map) => differingMapIds.has(map.id));
}

export function isUsecodeOnlyVariantGame(gameId) {
  const manifest = getFixedArchiveVariantManifest(gameId);
  return Boolean(manifest) && (manifest.differingMapIds?.length ?? 0) === 0;
}