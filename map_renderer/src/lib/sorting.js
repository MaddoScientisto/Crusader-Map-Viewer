import { FLAG_FLIPPED } from "./formats.js";

function rectIntersects(left, right) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function rectContains(outer, inner) {
  return outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom;
}

function listLessThan(left, right) {
  if (left.sprite !== right.sprite) {
    return left.sprite < right.sprite;
  }
  if (left.z !== right.z) {
    return left.z < right.z;
  }
  return left.flat > right.flat;
}

function overlap(left, right) {
  if (!rectIntersects(left, right)) {
    return false;
  }
  const pointTopDiff = [left.sx_top - right.sx_bot, left.sy_top - right.sy_bot];
  const pointBotDiff = [left.sx_bot - right.sx_top, left.sy_bot - right.sy_top];
  const dotTopLeft = pointTopDiff[0] + pointTopDiff[1] * 2;
  const dotTopRight = -pointTopDiff[0] + pointTopDiff[1] * 2;
  const dotBotLeft = pointBotDiff[0] - pointBotDiff[1] * 2;
  const dotBotRight = -pointBotDiff[0] - pointBotDiff[1] * 2;
  const rightClear = left.sx_right <= right.sx_left;
  const leftClear = left.sx_left >= right.sx_right;
  const topLeftClear = dotTopLeft >= 0;
  const topRightClear = dotTopRight >= 0;
  const botLeftClear = dotBotLeft >= 0;
  const botRightClear = dotBotRight >= 0;
  const clear = rightClear || leftClear || botRightClear || botLeftClear || topRightClear || topLeftClear;
  return !clear;
}

function occludes(left, right) {
  if (!rectContains(left, right)) {
    return false;
  }
  const pointTopDiff = [left.sx_top - right.sx_top, left.sy_top - right.sy_top];
  const pointBotDiff = [left.sx_bot - right.sx_bot, left.sy_bot - right.sy_bot];
  const dotTopLeft = pointTopDiff[0] + pointTopDiff[1] * 2;
  const dotTopRight = -pointTopDiff[0] + pointTopDiff[1] * 2;
  const dotBotLeft = pointBotDiff[0] - pointBotDiff[1] * 2;
  const dotBotRight = -pointBotDiff[0] - pointBotDiff[1] * 2;
  const rightRes = left.sx_right >= right.sx_right;
  const leftRes = left.sx_left <= right.sx_left;
  const topLeftRes = dotTopLeft <= 0;
  const topRightRes = dotTopRight <= 0;
  const botLeftRes = dotBotLeft <= 0;
  const botRightRes = dotBotRight <= 0;
  return rightRes && leftRes && botRightRes && botLeftRes && topRightRes && topLeftRes;
}

function below(left, right) {
  if (left.sprite !== right.sprite) {
    return left.sprite < right.sprite;
  }

  if (left.flat && right.flat) {
    if (left.z !== right.z) {
      return left.z < right.z;
    }
  } else if (left.invitem === right.invitem) {
    if (left.z_top <= right.z) {
      return true;
    }
    if (left.z >= right.z_top) {
      return false;
    }
  }

  const yFlatLeft = left.y_far === left.y;
  const yFlatRight = right.y_far === right.y;
  if (yFlatLeft && yFlatRight) {
    if (Math.floor(left.y / 32) !== Math.floor(right.y / 32)) {
      return left.y < right.y;
    }
  } else {
    if (left.y <= right.y_far) {
      return true;
    }
    if (left.y_far >= right.y) {
      return false;
    }
  }

  const xFlatLeft = left.x_left === left.x;
  const xFlatRight = right.x_left === right.x;
  if (xFlatLeft && xFlatRight) {
    if (Math.floor(left.x / 32) !== Math.floor(right.x / 32)) {
      return left.x < right.x;
    }
  } else {
    if (left.x <= right.x_left) {
      return true;
    }
    if (left.x_left >= right.x) {
      return false;
    }
  }

  if (left.z_top - 8 <= right.z && left.z < right.z_top - 8) {
    return true;
  }
  if (left.z >= right.z_top - 8 && left.z_top - 8 > right.z) {
    return false;
  }

  if (yFlatLeft !== yFlatRight) {
    if (Math.floor(left.y / 32) <= Math.floor(right.y_far / 32)) {
      return true;
    }
    if (Math.floor(left.y_far / 32) >= Math.floor(right.y / 32)) {
      return false;
    }
    const yCenterLeft = Math.floor((Math.floor(left.y_far / 32) + Math.floor(left.y / 32)) / 2);
    const yCenterRight = Math.floor((Math.floor(right.y_far / 32) + Math.floor(right.y / 32)) / 2);
    if (yCenterLeft !== yCenterRight) {
      return yCenterLeft < yCenterRight;
    }
  }

  if (xFlatLeft !== xFlatRight) {
    if (Math.floor(left.x / 32) <= Math.floor(right.x_left / 32)) {
      return true;
    }
    if (Math.floor(left.x_left / 32) >= Math.floor(right.x / 32)) {
      return false;
    }
    const xCenterLeft = Math.floor((Math.floor(left.x_left / 32) + Math.floor(left.x / 32)) / 2);
    const xCenterRight = Math.floor((Math.floor(right.x_left / 32) + Math.floor(right.x / 32)) / 2);
    if (xCenterLeft !== xCenterRight) {
      return xCenterLeft < xCenterRight;
    }
  }

  if (left.flat || right.flat) {
    if (left.z !== right.z) return left.z < right.z;
    if (left.invitem !== right.invitem) return left.invitem < right.invitem;
    if (left.flat !== right.flat) return left.flat > right.flat;
    if (left.trans !== right.trans) return left.trans < right.trans;
    if (left.anim !== right.anim) return left.anim < right.anim;
    if (left.draw !== right.draw) return left.draw > right.draw;
    if (left.solid !== right.solid) return left.solid > right.solid;
    if (left.occl !== right.occl) return left.occl > right.occl;
    if (left.fbigsq !== right.fbigsq) return left.fbigsq > right.fbigsq;
  }

  if (left.x === right.x && left.y === right.y && left.trans !== right.trans) {
    return left.trans < right.trans;
  }

  if (left.land && right.land && left.roof !== right.roof) {
    return left.roof < right.roof;
  }
  if (left.roof !== right.roof) {
    return left.roof > right.roof;
  }
  if (left.z !== right.z) {
    return left.z < right.z;
  }

  if (xFlatLeft || xFlatRight || yFlatLeft || yFlatRight) {
    if (left.sx_left !== right.sx_left) {
      return left.sx_left > right.sx_left;
    }
    if (left.sy_bot !== right.sy_bot) {
      return left.sy_bot < right.sy_bot;
    }
  }

  if (left.x + left.y !== right.x + right.y) return left.x + left.y < right.x + right.y;
  if (left.x_left + left.y_far !== right.x_left + right.y_far) return left.x_left + left.y_far < right.x_left + right.y_far;
  if (left.y !== right.y) return left.y < right.y;
  if (left.x !== right.x) return left.x < right.x;
  if (left.item.shape !== right.item.shape) return left.item.shape < right.item.shape;
  return left.item.frame < right.item.frame;
}

function buildSortNode(item, info, frame, pixels) {
  const flipped = Boolean(item.flags & FLAG_FLIPPED);
  const xdim = (flipped ? info.y : info.x) * 32;
  const ydim = (flipped ? info.x : info.y) * 32;
  const zdim = info.z * 8;
  const x = item.x;
  const y = item.y;
  const z = item.z;
  const xLeft = x - xdim;
  const yFar = y - ydim;
  const zTop = z + zdim;
  const sxLeft = Math.trunc(xLeft / 4 - y / 4);
  const sxRight = Math.trunc(x / 4 - yFar / 4);
  const sxTop = Math.trunc(xLeft / 4 - yFar / 4);
  const syTop = Math.trunc(xLeft / 8 + yFar / 8 - zTop);
  const sxBot = Math.trunc(x / 4 - y / 4);
  const syBot = Math.trunc(x / 8 + y / 8 - z);
  const left = flipped ? sxBot + frame.xoff - frame.width : sxBot - frame.xoff;
  const top = syBot - frame.yoff;
  const right = left + frame.width;
  const bottom = top + frame.height;

  return {
    item,
    info,
    frame,
    pixels,
    left,
    top,
    right,
    bottom,
    x,
    x_left: xLeft,
    y,
    y_far: yFar,
    z,
    z_top: zTop,
    sx_left: sxLeft,
    sx_right: sxRight,
    sx_top: sxTop,
    sy_top: syTop,
    sx_bot: sxBot,
    sy_bot: syBot,
    fbigsq: xdim === ydim && xdim >= 128,
    flat: zdim === 0,
    occl: info.isOccl && !info.isTranslucent,
    solid: info.isSolid,
    draw: info.isDraw,
    roof: info.isRoof,
    noisy: info.isNoisy,
    anim: info.animType !== 0,
    trans: info.isTranslucent,
    fixed: info.isFixed,
    land: info.isLand,
    sprite: false,
    invitem: info.isInvitem,
    occluded: false,
    order: -1,
    depends: []
  };
}

function insertDependencySorted(depends, node) {
  for (let index = 0; index < depends.length; index += 1) {
    const current = depends[index];
    if (current === node) {
      return false;
    }
    if (listLessThan(node, current)) {
      depends.splice(index, 0, node);
      return true;
    }
  }
  depends.push(node);
  return true;
}

function resolvePaintOrder(ordered, progress, checkpointEvery = 0) {
  const painted = [];

  function visit(node) {
    if (node.occluded || node.order >= 0) {
      return;
    }
    node.order = -2;
    for (const dependency of node.depends) {
      if (dependency.order === -2) {
        break;
      }
      if (dependency.order === -1) {
        visit(dependency);
      }
    }
    node.order = painted.length ? painted[painted.length - 1].order + 1 : 0;
    painted.push(node);
    if (progress && checkpointEvery > 0 && painted.length % checkpointEvery === 0) {
      progress(`paint resolved=${painted.length} of ${ordered.length}`);
    }
  }

  for (const node of ordered) {
    if (node.order === -1) {
      visit(node);
    }
  }
  if (progress) {
    progress(`paint complete resolved=${painted.length} of ${ordered.length}`);
  }
  return painted;
}

export function projectItemGeometry(items, archive, shapeInfos, options = {}) {
  const { progress, checkpointEvery = 0, maxInvalidDetails = 20 } = options;
  const projected = [];
  let invalidItemCount = 0;
  const invalidItems = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    try {
      const decoded = archive.decodeFrame(item.shape, item.frame);
      projected.push(buildSortNode(item, shapeInfos[item.shape], decoded.frame, decoded.pixels));
    } catch (error) {
      invalidItemCount += 1;
      if (invalidItems.length < maxInvalidDetails) {
        invalidItems.push({
          shape: item.shape,
          frame: item.frame,
          x: item.x,
          y: item.y,
          z: item.z,
          source: item.source,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (progress && checkpointEvery > 0 && (itemIndex + 1) % checkpointEvery === 0) {
      progress(`project processed=${itemIndex + 1} valid=${projected.length} invalid=${invalidItemCount}`);
    }
  }

  projected.sort((left, right) => {
    if (left.sy_bot !== right.sy_bot) {
      return left.sy_bot - right.sy_bot;
    }
    if (left.sx_bot !== right.sx_bot) {
      return left.sx_bot - right.sx_bot;
    }
    if (left.item.shape !== right.item.shape) {
      return left.item.shape - right.item.shape;
    }
    return left.item.frame - right.item.frame;
  });

  if (progress) {
    progress(`project complete processed=${items.length} valid=${projected.length} invalid=${invalidItemCount}`);
  }

  return {
    projected,
    invalidItemCount,
    invalidItems
  };
}

export function prepareSortedItems(items, archive, shapeInfos, options = {}) {
  const { progress, checkpointEvery = 0, maxInvalidDetails = 20 } = options;
  const ordered = [];
  let minLeft = Number.MAX_SAFE_INTEGER;
  let minTop = Number.MAX_SAFE_INTEGER;
  let maxRight = -Number.MAX_SAFE_INTEGER;
  let maxBottom = -Number.MAX_SAFE_INTEGER;
  let occludedCount = 0;
  let invalidItemCount = 0;
  const invalidItems = [];
  let dependencyCount = 0;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    let frame;
    let pixels;
    try {
      const decoded = archive.decodeFrame(item.shape, item.frame);
      frame = decoded.frame;
      pixels = decoded.pixels;
    } catch (error) {
      invalidItemCount += 1;
      if (invalidItems.length < maxInvalidDetails) {
        invalidItems.push({
          shape: item.shape,
          frame: item.frame,
          x: item.x,
          y: item.y,
          z: item.z,
          source: item.source,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
      continue;
    }

    const node = buildSortNode(item, shapeInfos[item.shape], frame, pixels);
    minLeft = Math.min(minLeft, node.left);
    minTop = Math.min(minTop, node.top);
    maxRight = Math.max(maxRight, node.right);
    maxBottom = Math.max(maxBottom, node.bottom);

    let insertAt = ordered.length;
    for (let index = 0; index < ordered.length; index += 1) {
      const other = ordered[index];
      if (insertAt === ordered.length && listLessThan(node, other)) {
        insertAt = index;
      }
      if (other.occluded) {
        continue;
      }
      if (!overlap(node, other)) {
        continue;
      }
      if (below(node, other)) {
        if (other.occl && occludes(other, node)) {
          node.occluded = true;
          occludedCount += 1;
          break;
        }
        if (insertDependencySorted(other.depends, node)) {
          dependencyCount += 1;
        }
      } else if (node.occl && occludes(node, other)) {
        if (!other.occluded) {
          other.occluded = true;
          occludedCount += 1;
        }
      } else if (insertDependencySorted(node.depends, other)) {
        dependencyCount += 1;
      }
    }
    ordered.splice(insertAt, 0, node);

    if (progress && checkpointEvery > 0 && (itemIndex + 1) % checkpointEvery === 0) {
      progress(
        `sort processed=${itemIndex + 1} valid=${ordered.length} occluded=${occludedCount} invalid=${invalidItemCount} dependencies=${dependencyCount}`
      );
    }
  }

  if (progress) {
    progress(
      `sort complete processed=${items.length} valid=${ordered.length} occluded=${occludedCount} invalid=${invalidItemCount} dependencies=${dependencyCount}`
    );
  }

  return {
    minLeft,
    minTop,
    maxRight,
    maxBottom,
    prepared: resolvePaintOrder(ordered, progress, checkpointEvery),
    occludedCount,
    invalidItemCount,
    invalidItems
  };
}
