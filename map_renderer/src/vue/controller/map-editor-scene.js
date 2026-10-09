import { prepareSortedItems } from "../../lib/sorting.js";

function buildSortInfo(definition) {
  const dimensions = definition.dimensions ?? {};
  const traits = definition.traits ?? {};
  return {
    x: dimensions.x ?? 0,
    y: dimensions.y ?? 0,
    z: dimensions.z ?? 0,
    isOccl: Boolean(traits.occluding),
    isTranslucent: Boolean(traits.translucent),
    isSolid: Boolean(traits.solid),
    isDraw: Boolean(traits.draw),
    isRoof: Boolean(traits.roof),
    isNoisy: false,
    isFixed: Boolean(traits.fixed),
    isLand: Boolean(traits.land),
    animType: traits.animType ?? 0,
    isInvitem: Boolean(traits.invitem)
  };
}

export function sortMapEditorSceneItems(items, shapeDefinitions, spriteIndex) {
  if (items.length === 0) {
    return { prepared: [], bounds: null };
  }

  const shapeInfos = [];
  for (const definition of shapeDefinitions.values()) {
    if (Number.isInteger(definition.shape)) {
      shapeInfos[definition.shape] = buildSortInfo(definition);
    }
  }

  const spritesByFrame = new Map([...spriteIndex.values()].map((sprite) => [`${sprite.shape}:${sprite.frame}`, sprite]));
  const sortItems = items.map((sceneItem) => {
    const definition = shapeDefinitions.get(sceneItem.shapeDefId);
    if (!definition || !Number.isFinite(sceneItem.world?.x) || !Number.isFinite(sceneItem.world?.y) || !Number.isFinite(sceneItem.world?.z)) {
      throw new Error(`Cannot sort scene item ${sceneItem.id}: missing shape or world coordinates.`);
    }
    if (!spritesByFrame.has(`${definition.shape}:${sceneItem.frame}`)) {
      throw new Error(`Cannot sort scene item ${sceneItem.id}: missing sprite frame.`);
    }
    return {
      x: sceneItem.world.x,
      y: sceneItem.world.y,
      z: sceneItem.world.z,
      shape: definition.shape,
      frame: sceneItem.frame,
      flags: sceneItem.flags?.raw ?? 0,
      source: sceneItem.source,
      sceneItem
    };
  });

  const archive = {
    decodeFrame(shape, frame) {
      const sprite = spritesByFrame.get(`${shape}:${frame}`);
      if (!sprite) {
        throw new Error(`Missing sprite frame ${shape}:${frame}.`);
      }
      return { frame: sprite, pixels: null };
    }
  };
  const result = prepareSortedItems(sortItems, archive, shapeInfos, { maxInvalidDetails: 0 });
  return {
    prepared: result.prepared,
    bounds: Number.isFinite(result.minLeft) ? {
      screenLeft: result.minLeft,
      screenTop: result.minTop,
      screenRight: result.maxRight,
      screenBottom: result.maxBottom,
      width: result.maxRight - result.minLeft,
      height: result.maxBottom - result.minTop
    } : null
  };
}