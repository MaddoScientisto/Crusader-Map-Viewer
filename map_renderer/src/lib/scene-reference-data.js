import { GAMES } from "../config.js";
import { packCompactMapSourceItems, packCompactSceneItems } from "../shared/compact-scene-codec.js";

function getGameEntry(gameId) {
  return GAMES.find((game) => game.id === gameId) ?? null;
}

export function getSceneReferenceId(gameId) {
  const game = getGameEntry(gameId);
  return game?.catalogId ?? game?.gameId ?? gameId;
}

export function mergeShapeDefinitions(target, definitions = []) {
  for (const definition of definitions) {
    if (!definition?.id) {
      continue;
    }
    target.set(definition.id, definition);
  }
  return target;
}

export function mergeById(target, entries = []) {
  for (const entry of entries) {
    if (!entry?.id) {
      continue;
    }
    target.set(entry.id, entry);
  }
  return target;
}

export function buildSceneReferencePayload(referenceId, payload, sourceGameIds = []) {
  const shapeDefinitions = payload?.shapeDefinitions ?? [];
  const sprites = payload?.sprites ?? [];
  const atlases = payload?.atlases ?? [];
  return {
    referenceId,
    generatedAt: new Date().toISOString(),
    fingerprint: payload?.fingerprint ?? null,
    sourceGameIds: [...new Set(sourceGameIds)].sort(),
    shapeDefinitionCount: shapeDefinitions.length,
    spriteCount: sprites.length,
    atlasCount: atlases.length,
    shapeDefinitions,
    sprites,
    atlases
  };
}

export function buildCompactScenePayload(scene, referenceId) {
  const {
    atlases: inlineAtlases,
    sprites: inlineSprites,
    shapeDefinitions: inlineShapeDefinitions,
    ...sceneWithoutShapeDefinitions
  } = scene ?? {};
  const spriteIds = Array.isArray(scene?.sprites)
    ? scene.sprites.map((sprite) => sprite.id)
    : Array.isArray(scene?.references?.spriteIds)
      ? scene.references.spriteIds
    : [];
  const atlasIds = Array.isArray(scene?.atlases)
    ? scene.atlases.map((atlas) => atlas.id)
    : Array.isArray(scene?.references?.atlasIds)
      ? scene.references.atlasIds
    : [];
  const shapeDefinitionIds = Array.isArray(scene?.shapeDefinitions)
    ? scene.shapeDefinitions.map((definition) => definition.id)
    : Array.isArray(scene?.references?.shapeDefinitionIds)
      ? scene.references.shapeDefinitionIds
    : [];
  const metadata = scene?.metadata && typeof scene.metadata === "object"
    ? { ...scene.metadata }
    : scene?.metadata;

  if (metadata && typeof metadata === "object") {
    delete metadata.gameLabel;
    if (metadata.usage && typeof metadata.usage === "object") {
      metadata.usage = {
        ...metadata.usage,
        missionMapTableId: referenceId
      };
      delete metadata.usage.tableAddress;
      delete metadata.usage.entryCount;
      delete metadata.usage.baseMaps;
      delete metadata.usage.game;
      delete metadata.usage.map;
    }
  }

  const itemEncoding = Array.isArray(scene?.items)
    ? packCompactSceneItems(scene.items)
    : null;
  const mapSource = sceneWithoutShapeDefinitions?.mapSource && typeof sceneWithoutShapeDefinitions.mapSource === "object"
    ? { ...sceneWithoutShapeDefinitions.mapSource }
    : sceneWithoutShapeDefinitions?.mapSource;

  if (mapSource && Array.isArray(mapSource.items)) {
    mapSource.itemEncoding = packCompactMapSourceItems(mapSource.items);
    delete mapSource.items;
  }

  return {
    ...sceneWithoutShapeDefinitions,
    metadata,
    mapSource,
    itemEncoding,
    items: Array.isArray(scene?.items) ? undefined : sceneWithoutShapeDefinitions.items,
    references: {
      referenceId,
      atlasIds,
      spriteIds,
      shapeDefinitionIds
    }
  };
}