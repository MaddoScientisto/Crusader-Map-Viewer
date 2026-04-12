import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { APP_ROOT } from "../src/config.js";
import { extractMapPayload, getFixedArchiveEntries } from "../src/lib/map-source.js";

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function getFixedPath(dirName) {
  return path.join(APP_ROOT, dirName, "FIXED.DAT");
}

function loadArchiveInfo(filePath) {
  const data = fs.readFileSync(filePath);
  return {
    filePath,
    data,
    sha1: sha1(data),
    entries: getFixedArchiveEntries(data)
  };
}

function compareArchiveMaps(leftArchive, rightArchive) {
  const differingMaps = [];
  const identicalMaps = [];
  const mapCount = Math.max(leftArchive.entries.length, rightArchive.entries.length);

  for (let mapId = 0; mapId < mapCount; mapId += 1) {
    const leftEntry = leftArchive.entries[mapId];
    const rightEntry = rightArchive.entries[mapId];
    const leftHasData = Boolean(leftEntry && leftEntry.size > 0);
    const rightHasData = Boolean(rightEntry && rightEntry.size > 0);

    if (!leftHasData && !rightHasData) {
      continue;
    }

    if (leftHasData !== rightHasData) {
      differingMaps.push({
        mapId,
        reason: leftHasData ? "left-only" : "right-only",
        leftSize: leftEntry?.size ?? 0,
        rightSize: rightEntry?.size ?? 0
      });
      continue;
    }

    const leftPayload = extractMapPayload(leftArchive.data, mapId);
    const rightPayload = extractMapPayload(rightArchive.data, mapId);
    const leftSha1 = sha1(leftPayload);
    const rightSha1 = sha1(rightPayload);

    if (leftSha1 === rightSha1) {
      identicalMaps.push(mapId);
      continue;
    }

    differingMaps.push({
      mapId,
      reason: "payload-diff",
      leftSize: leftPayload.length,
      rightSize: rightPayload.length,
      leftSha1,
      rightSha1
    });
  }

  return {
    identicalMaps,
    differingMaps,
    differingMapIds: differingMaps.map((entry) => entry.mapId)
  };
}

function main() {
  const retailArchive = loadArchiveInfo(getFixedPath("STATIC"));
  const jpArchive = loadArchiveInfo(getFixedPath("STATIC_JP"));
  const comparison = compareArchiveMaps(retailArchive, jpArchive);

  console.log(JSON.stringify({
    retailFixedSha1: retailArchive.sha1,
    jpFixedSha1: jpArchive.sha1,
    sameArchive: retailArchive.sha1 === jpArchive.sha1,
    retailMapCount: retailArchive.entries.length,
    jpMapCount: jpArchive.entries.length,
    identicalMapCount: comparison.identicalMaps.length,
    differingMapCount: comparison.differingMaps.length,
    identicalMaps: comparison.identicalMaps,
    differingMaps: comparison.differingMaps
  }, null, 2));
}

main();