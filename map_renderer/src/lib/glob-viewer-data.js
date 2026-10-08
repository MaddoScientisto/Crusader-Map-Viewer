import { prepareSortedItems } from "./sorting.js";

export function buildGlobViewerEntries(globs, usageByIndex = new Map(), renderOrdersByIndex = new Map()) {
  return globs.map((children, index) => ({
    index,
    children: children.map((child, childIndex) => ({
      childIndex,
      renderOrder: renderOrdersByIndex.get(index)?.get(childIndex) ?? childIndex,
      x: child.x,
      y: child.y,
      z: child.z,
      shape: child.shape,
      frame: child.frame,
      spriteId: `sprite:${child.shape}:${child.frame}`
    })),
    maps: [...new Set(usageByIndex.get(index) ?? [])].sort((left, right) => left - right)
  }));
}

export function buildGlobRenderOrders(globs, shapeArchive, shapeInfos) {
  return new Map(globs.map((children, globIndex) => {
    const sortItems = children.map((child, childIndex) => ({
      ...child,
      childIndex,
      x: (child.x << 2) + 2,
      y: (child.y << 2) + 2,
      flags: 0,
      source: "glob"
    }));
    const sorted = prepareSortedItems(sortItems, shapeArchive, shapeInfos, { maxInvalidDetails: 0 }).prepared;
    const orderByChild = new Map(sorted.map((node, order) => [node.item.childIndex, order]));
    let nextOrder = sorted.length;
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      if (!orderByChild.has(childIndex)) {
        orderByChild.set(childIndex, nextOrder);
        nextOrder += 1;
      }
    }
    return [globIndex, orderByChild];
  }));
}