const DTABLE_NPC_SHAPES = new Set([0x04d0]);
const CHEST_ITEM_SPAWNER_SHAPE = 0x0476;
const MONSTER_EGG_PREVIEW_SHAPE = 0x024f;
const MONSTER_SPAWNER_SHAPE = 0x04d0;
const MONSTER_SPAWNER_PAIR_MAX_DISTANCE = 512;
const BOX_EW_SHAPE = 0x0080;
const USECODE_TRIGGER_EGG_SHAPE = 0x0011;
const MONITNS_SHAPE = 0x0102;
const MONITEW_SHAPE = 0x0165;
const VALUEBOX_SHAPE = 0x0251;
const FASTSKIL_SHAPE = 0x0120;
const PANELNS_SHAPE = 0x00a1;
const PANELEW_SHAPE = 0x00a2;
const CRUMORPH_SHAPE = 0x0318;
const CARD_NS_SHAPE = 0x031d;
const NUMBERS_SHAPE = 0x033a;
const NPCTRIG_SHAPE = 0x0363;
const CRUZTRIG_SHAPE = 0x0365;
const VMAIL_SHAPE = 0x0367;
const NPC_ONLY_SHAPE = 0x0366;
const SPANEL_SHAPE = 0x03aa;
const GENERATR_SHAPE = 0x03c1;
const FLAMEBOX_SHAPE = 0x0403;
const TIMER_SHAPE = 0x04c9;
const SPECIAL_SHAPE = 0x04ca;
const TRIGPAD_SHAPE = 0x04cd;
const SKILLBOX_SHAPE = 0x04e3;
const SFXTRIG_SHAPE = 0x04e2;
const DEATHBOX_SHAPE = 0x04e7;
const CMD_LINK_SHAPE = 0x04b1;
const EVENT_SHAPE = 0x0361;
const DOOR_DEATH_HELPER_SHAPE = 0x04f8;
const BRO_BOOT_SHAPE = 0x04fe;
const STEAMBOX_SHAPE = 0x0500;
const WATCHNS_SHAPE = 0x04c6;
const WATCHEW_SHAPE = 0x04de;
const SECRET_DOOR_POST_SHAPE = 0x0510;
const CRAZYEW_SHAPE = 0x0451;
const VIDEOBOX_SHAPE = 0x056d;
const ALARMHAT_SHAPE = 0x0561;
const ALRMTRIG_SHAPE = 0x0581;
const CRAZYNS_SHAPE = 0x05ae;
const PRESSURE_BARRIER_V_SHAPE = 0x05df;
const PRESSURE_BARRIER_H_SHAPE = 0x05e0;
const CRYOBOX_SHAPE = 0x05e1;
const CHEST_NS_SHAPE = 0x054f;
const CHEST_EW_SHAPE = 0x0550;
const CMD_LINK_MAX_DISTANCE = 768;
const VALUEBOX_LINK_DISTANCE = 768;
const CRUSADER_EGG_RANGE_WORLD_UNITS = 64;
const CHANGER_SCAN_DISTANCE = 100 * 32;
const CHANGER_REMORSE_SCAN_DISTANCE = 100 * 32;
const CHANGER_REMORSE_ROOF_TARGET_SHAPES = [0x03a7, 0x03a8, 0x021a, 0x012e, 0x051c, 0x051b];
const CHANGER_REGRET_ROOF_TARGET_SHAPES = [0x03a7, 0x03a8, 0x021a, 0x012e, 0x04df, 0x051c, 0x051b, 0x0639, 0x063a, 0x063b, 0x063c, 0x063d];
const VALUEBOX_CONSUMER_SHAPES = new Set([MONITNS_SHAPE, MONITEW_SHAPE, WATCHNS_SHAPE, WATCHEW_SHAPE]);
const VALUEBOX_TEXTFILE_MESSAGE_HINTS = new Map([
  [0, "random WEC network/system notice pool"],
  [1, "Doors have been opened."],
  [2, "Force field deactivated."],
  [3, "Electronic bridge extended."],
  [4, "Security systems activated."],
  [5, "Security systems de-activated."],
  [10, "delete this message / spies are everywhere"],
  [11, "Security Cartel HQD / Thresher Cannon active"],
  [12, "Refinery Ops fire warning"],
  [13, "Refinery Ops plutonium contamination warning"],
  [14, "Remote viewing facility / Watch Station now active"],
  [15, "remote service droid now online"],
  [16, "Remote alarm panel / stand down from alert"],
  [17, "Remote Operations / Watch Station now active"]
]);

function formatWordHexLiteral(value) {
  return `0x${value.toString(16).padStart(4, "0")}`;
}
const USECODE_TRIGGER_EGG_SUBTYPE_CLASSES = {
  remorse: {
    0: {
      className: "TRIGEGG",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch / unhatch",
      note: "TRIGEGG hatch and unhatch both spawn TRIGGER.slot_20 with phases 0x80 and 0x81, using the egg's local QLo as the downstream link id.",
      overlayNote: "Renderer arrows expose nearby 0x04B1 cmd helpers that share this egg's local QLo link id."
    },
    1: {
      className: "ONCEEGG",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch / unhatch",
      note: "ONCEEGG uses the same TRIGGER.slot_20 routing as TRIGEGG in the recovered corpus, again keyed by the egg's local QLo.",
      overlayNote: "Renderer arrows expose nearby 0x04B1 cmd helpers that share this egg's local QLo link id."
    },
    2: {
      className: "FLOOR1",
      slot: 0x0f,
      eventNameHint: "enterFastArea",
      activeLaneLabel: "enterFastArea / leaveFastArea",
      note: "FLOOR1 does not use hatch and unhatch. Its fast-area lanes run a timed floor/NPC sweep driven by egg id timing and nearby item QLo values.",
      overlayNote: "No generic arrow overlay is shown because the recovered body scans nearby floor items and NPCs rather than a stable helper family."
    },
    4: {
      className: "CHANGER",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch",
      note: `CHANGER reads the egg id from mapNum, then runs a recovered nearby-roof selector over hardcoded roof shapes ${CHANGER_REMORSE_ROOF_TARGET_SHAPES.map((shape) => formatWordHexLiteral(shape)).join(", ")} within ${CHANGER_SCAN_DISTANCE} world units before destroying roofs whose low quality byte matches that egg id. The checked Remorse map-13 example uses egg id 37 beside eight matching roof tiles with QLo 37.`,
      overlayNote: `Renderer arrows expose nearby roof targets for the recovered Remorse CHANGER scan: same-egg-id roof tiles on the verified shape whitelist within ${CHANGER_SCAN_DISTANCE} world units of the egg.`
    },
    13: {
      className: "MISS1EGG",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch",
      note: "MISS1EGG is mission-specific. The recovered hatch body branches by egg id and can trigger scripted spawns, NPC handling, or localized event flow rather than one reusable helper lane.",
      overlayNote: "No generic arrow overlay is shown because the recovered body is mission-specific rather than a reusable local helper router."
    }
  },
  regret: {
    0: {
      className: "TRIGEGG",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch / unhatch",
      note: "TRIGEGG hatch and unhatch both spawn TRIGGER.slot_20 with phases 0x80 and 0x81, using the egg's local QLo as the downstream link id.",
      overlayNote: "Renderer arrows expose nearby 0x04B1 cmd helpers that share this egg's local QLo link id."
    },
    1: {
      className: "ONCEEGG",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch / unhatch",
      note: "ONCEEGG uses the same TRIGGER.slot_20 routing as TRIGEGG in the recovered corpus, again keyed by the egg's local QLo.",
      overlayNote: "Renderer arrows expose nearby 0x04B1 cmd helpers that share this egg's local QLo link id."
    },
    2: {
      className: "FLOOR1",
      slot: 0x0f,
      eventNameHint: "enterFastArea",
      activeLaneLabel: "enterFastArea / leaveFastArea",
      note: "FLOOR1 does not use hatch and unhatch. Its fast-area lanes run a timed floor/NPC sweep driven by egg id timing and nearby item QLo values.",
      overlayNote: "No generic arrow overlay is shown because the recovered body scans nearby floor items and NPCs rather than a stable helper family."
    },
    5: {
      className: "MHATCHER",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch",
      note: "MHATCHER scans nearby 0x04D0 helper objects and matches their QLo against the egg id stored in mapNum.",
      overlayNote: "Renderer arrows expose nearby frame-0 0x04D0 helpers whose QLo matches this egg's mapNum egg id."
    },
    8: {
      className: "CHANGER",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch",
      note: `CHANGER reads the egg id from mapNum, then runs a recovered nearby-roof selector over hardcoded roof shapes ${CHANGER_REGRET_ROOF_TARGET_SHAPES.map((shape) => formatWordHexLiteral(shape)).join(", ")} within ${CHANGER_SCAN_DISTANCE} world units before destroying nonzero roofs whose low quality byte matches that egg id. Checked Regret cache examples on maps 1 and 10 produce matching nearby roof targets on this whitelist.`,
      overlayNote: `Renderer arrows expose nearby roof targets for the recovered Regret CHANGER scan: same-egg-id roof tiles on the verified shape whitelist within ${CHANGER_SCAN_DISTANCE} world units of the egg.`
    },
    10: {
      className: "DOOREGG",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch / unhatch via slot_20 / slot_21",
      note: "DOOREGG delegates into helper slots that scan nearby family-1 door objects whose QLo matches the egg id stored in mapNum.",
      overlayNote: "Renderer arrows expose nearby door-family objects whose QLo matches this egg's mapNum egg id."
    },
    13: {
      className: "MISS1",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch",
      note: "MISS1 is mission-specific. Its recovered hatch body branches by egg id, can manipulate nearby doors, and only sometimes falls back into TRIGGER routing.",
      overlayNote: "No generic arrow overlay is shown because the recovered body is mission-specific rather than a reusable local helper router."
    },
    24: {
      className: "VIDEOEGG",
      slot: 0x07,
      eventNameHint: "hatch",
      activeLaneLabel: "hatch",
      note: "VIDEOEGG is a cutscene/script egg gated by globals and nearby helper state, not a generic local trigger helper.",
      overlayNote: "No generic arrow overlay is shown because the recovered body is cutscene-specific rather than a reusable local helper router."
    }
  }
};

function getUsecodeTriggerEggRange(item) {
  if (item?.egg?.type !== "usecode-trigger" || !Number.isInteger(item?.npcNum)) {
    return null;
  }

  const rawNpcNum = item.npcNum & 0xff;
  const xRange = (rawNpcNum >> 4) & 0x0f;
  const yRange = rawNpcNum & 0x0f;

  return {
    rawNpcNum,
    xRange,
    yRange,
    worldXRange: xRange * CRUSADER_EGG_RANGE_WORLD_UNITS,
    worldYRange: yRange * CRUSADER_EGG_RANGE_WORLD_UNITS,
    zWindow: 48
  };
}

function getUsecodeTriggerEggSubtypeInfo(item, gameId) {
  if (item?.egg?.type !== "usecode-trigger") {
    return null;
  }

  const rawQuality = Number.isInteger(item?.quality) ? (item.quality & 0xffff) : null;
  const rawMapNum = Number.isInteger(item?.mapNum) ? (item.mapNum & 0xff) : null;
  const qLo = rawQuality === null ? null : (rawQuality & 0xff);
  const qHi = rawQuality === null ? null : ((rawQuality >> 8) & 0xff);
  if (!Number.isInteger(qLo)) {
    return null;
  }

  const subtypeCatalog = USECODE_TRIGGER_EGG_SUBTYPE_CLASSES[gameId] ?? null;
  const subtype = subtypeCatalog ? subtypeCatalog[qLo] ?? null : null;

  return {
    qLo,
    qHi,
    rawQuality,
    rawMapNum,
    classId: 0x0900 + qLo,
    ...(subtype ?? {
      className: null,
      slot: null,
      eventNameHint: null,
      activeLaneLabel: null,
      note: "This QLo value still resolves into the family-4 class range 0x0900 + QLo, but the exact authored class has not been promoted in the viewer yet.",
      overlayNote: "No generic arrow overlay is shown for unresolved family-4 subtypes."
    })
  };
}

function getTimerMetadata(item) {
  if (!Number.isInteger(item?.mapNum) || !Number.isInteger(item?.npcNum) || !Number.isInteger(item?.quality)) {
    return null;
  }

  const rawMapNum = item.mapNum & 0xff;
  const rawNpcNum = item.npcNum & 0xff;
  const rawQuality = item.quality & 0xffff;
  const qHi = (rawQuality >> 8) & 0xff;
  const packedDelay = ((rawMapNum << 8) | rawNpcNum) & 0xffff;
  const trimTier = (qHi >> 5) & 0x07;
  const trimPercents = [0, 10, 25, 40, 50, 60, 75, 90];
  const trimPercent = trimPercents[trimTier] ?? 0;
  const trimmedDelay = packedDelay - Math.floor((packedDelay * trimPercent) / 100);

  return {
    rawMapNum,
    rawNpcNum,
    rawQuality,
    qHi,
    packedDelay,
    trimTier,
    trimPercent,
    trimmedDelay,
    repeatWhileArmed: Boolean(qHi & 0x01),
    armOnEnterFastArea: Boolean(qHi & 0x02),
    armOnLeaveFastArea: Boolean(qHi & 0x04),
    phaseRoutingBit: Boolean(qHi & 0x08),
    suppressPhaseOneBit: Boolean(qHi & 0x10)
  };
}

function getSpecialMetadata(item) {
  if (!Number.isInteger(item?.mapNum) || !Number.isInteger(item?.npcNum) || !Number.isInteger(item?.quality)) {
    return null;
  }

  const rawMapNum = item.mapNum & 0xff;
  const rawNpcNum = item.npcNum & 0xff;
  const rawQuality = item.quality & 0xffff;
  const qLo = rawQuality & 0xff;
  const qHi = (rawQuality >> 8) & 0xff;

  return {
    rawMapNum,
    rawNpcNum,
    rawQuality,
    qLo,
    qHi,
    immediateEnterPhase: rawMapNum === 1,
    immediateExitPhase: rawMapNum === 2,
    immediateNpcEnterPhase: rawNpcNum === 1,
    immediateNpcExitPhase: rawNpcNum === 2
  };
}

export function createSceneMetadataHelpers(dependencies) {
  const {
    state,
    escapeHtml,
    getNpcSpawnerInfo,
    getShapeDefinition,
    getLinkedPreviewDisplay,
    formatNumericField,
    formatWorldCoords
  } = dependencies;
  let monsterSpawnerAnalysisCache = null;

  function getMonsterSpawnerAnalysis() {
    if (!state.current) {
      return {
        items: [],
        bySignalKey: new Map(),
        pairCandidatesById: new Map(),
        likelySpawnOwnerById: new Map()
      };
    }

    const dataRevision = state.current.dataRevision ?? 0;
    if (
      monsterSpawnerAnalysisCache
      && monsterSpawnerAnalysisCache.current === state.current
      && monsterSpawnerAnalysisCache.dataRevision === dataRevision
    ) {
      return monsterSpawnerAnalysisCache;
    }

    const items = [];
    const bySignalKey = new Map();
    for (const item of state.current.scene.items) {
      const definition = getShapeDefinition(item.shapeDefId);
      if (!isMonsterSpawnerItem(item, definition)) {
        continue;
      }
      items.push(item);
      const signalKey = getMonsterSpawnerSignalKey(item);
      if (!Number.isInteger(signalKey)) {
        continue;
      }
      const existing = bySignalKey.get(signalKey);
      if (existing) {
        existing.push(item);
      } else {
        bySignalKey.set(signalKey, [item]);
      }
    }

    monsterSpawnerAnalysisCache = {
      current: state.current,
      dataRevision,
      items,
      bySignalKey,
      pairCandidatesById: new Map(),
      likelySpawnOwnerById: new Map()
    };
    return monsterSpawnerAnalysisCache;
  }

  function isMonsterSpawnerItem(item, definition = null) {
    return definition?.shape === MONSTER_SPAWNER_SHAPE;
  }

  function isMonsterSpawnerAutoEnterEnabled(item) {
    return (((item?.mapNum ?? 0) & 0x08) === 0);
  }

  function getMonsterSpawnerActivationSummary(item) {
    if (item?.frame === 0) {
      return isMonsterSpawnerAutoEnterEnabled(item)
        ? "Frame 0 plus clear map bit 0x08 uses the MONSTER enterFastArea auto-spawn lane."
        : "Frame 0 is present, but set map bit 0x08 skips the MONSTER enterFastArea auto-spawn lane.";
    }
    if (item?.frame === 1) {
      return "Frame 1 skips the MONSTER enterFastArea hook and is more likely used in paired or externally signaled setups.";
    }
    return `Frame ${formatNumericField(item?.frame)} is not yet characterized for MONSTER enterFastArea.`;
  }

  function getMonsterSpawnerPairDistance(item, candidate) {
    return Math.hypot(candidate.world.x - item.world.x, candidate.world.y - item.world.y);
  }

  function canResolveNpcInfo(item, definition = null) {
    if (!Number.isInteger(item?.npcNum) || item.npcNum <= 0) {
      return false;
    }
    if (DTABLE_NPC_SHAPES.has(definition?.shape)) {
      return true;
    }
    return definition?.shape === MONSTER_EGG_PREVIEW_SHAPE && item.frame === 0 && item.egg?.type === "monster-spawn";
  }

  function getNpcSpawnerInfoForItem(item, definition = null) {
    if (!canResolveNpcInfo(item, definition)) {
      return null;
    }
    return getNpcSpawnerInfo(state.current?.selected?.game ?? null, item.npcNum);
  }

  function renderNpcMetadataRows(item, definition = null) {
    if (definition?.shape === MONSTER_SPAWNER_SHAPE) {
      const selfNpcInfo = getNpcSpawnerInfoForItem(item, definition);
      const selfNpcValue = selfNpcInfo
        ? `${item.npcNum} (${selfNpcInfo.name})`
        : formatNumericField(item.npcNum);
      const pairCandidates = getMonsterSpawnerPairCandidates(item)
        .sort((left, right) => getMonsterSpawnerPairDistance(item, left) - getMonsterSpawnerPairDistance(item, right));
      const nearestPair = pairCandidates[0] ?? null;
      const nearestPairNpcInfo = nearestPair ? getNpcSpawnerInfoForItem(nearestPair, definition) : null;
      const practicalPreview = getMonsterSpawnerLikelySpawnOwner(item);
      const practicalNpcInfo = practicalPreview.item ? getNpcSpawnerInfoForItem(practicalPreview.item, definition) : null;
      const practicalNpcValue = practicalPreview.item
        ? (practicalNpcInfo ? `${practicalPreview.item.npcNum} (${practicalNpcInfo.name})` : formatNumericField(practicalPreview.item.npcNum))
        : "unresolved";
      const roleNote = item.frame === 0
        ? "Frame 0 is the controller-side record that MONSTER.enterFastArea checks directly. In confirmed auto-enabled pairs, the visible NPC often aligns better with the paired frame-1 preview than with this controller row."
        : "Frame 1 is the paired preview-side record in the confirmed map-1 and map-248 examples. The viewer treats it as the practical NPC preview when an auto-enabled controller row points at it.";
      const selfRowLabel = item.frame === 0 ? "Controller row" : "Paired row";
      const selfShapeLabel = item.frame === 0 ? "Controller shape" : "Paired shape";
      const selfShapeRow = selfNpcInfo?.shapeHex
        ? `
        <dt>${selfShapeLabel}</dt><dd>${escapeHtml(selfNpcInfo.shapeHex)}</dd>`
        : "";
      const pairRow = nearestPair
        ? `
        <dt>Nearest pair</dt><dd>${escapeHtml(`${nearestPairNpcInfo ? `${nearestPair.npcNum} (${nearestPairNpcInfo.name})` : formatNumericField(nearestPair.npcNum)} · frame ${nearestPair.frame}`)}</dd>`
        : "";
      const practicalRow = practicalPreview.item
        ? `
        <dt>Practical preview</dt><dd>${escapeHtml(`${practicalNpcValue}${practicalPreview.ambiguous ? ` (${practicalPreview.basis}, nearest of ${practicalPreview.pairCount})` : ` (${practicalPreview.basis})`}`)}</dd>${practicalNpcInfo?.shapeHex ? `
        <dt>Practical shape</dt><dd>${escapeHtml(practicalNpcInfo.shapeHex)}</dd>` : ""}`
        : "";
      return `
        <dt>${selfRowLabel}</dt><dd>${escapeHtml(selfNpcValue)}</dd>${selfShapeRow}${pairRow}${practicalRow}
        <dt>Pair role</dt><dd>${escapeHtml(roleNote)}</dd>
        <dt>Map</dt><dd>${escapeHtml(formatNumericField(item.mapNum))}</dd>
        <dt>Quality</dt><dd>${escapeHtml(formatNumericField(item.quality))}</dd>
      `;
    }

    const npcInfo = getNpcSpawnerInfoForItem(item, definition);
    const npcValue = npcInfo
      ? `${item.npcNum} (${npcInfo.name})`
      : formatNumericField(item.npcNum);
    const npcShapeRow = npcInfo?.shapeHex
      ? `
        <dt>NPC shape</dt><dd>${escapeHtml(npcInfo.shapeHex)}</dd>`
      : "";
    const frameNoteRow = definition?.shape === 0x04d0
      ? `
        <dt>04D0 frame note</dt><dd>${escapeHtml(item.frame === 0
          ? "Frame 0 is the state directly targeted by the current alarm/helper scans."
          : "Frame 1 appears to be a paired state; current script evidence still targets frame 0 helpers.")}</dd>`
      : "";
    const crusaderRowNote = npcInfo?.name?.trim().toLowerCase() === "crusader" && item.npcNum === 0
      ? `
        <dt>NPC note</dt><dd>DTABLE row 0 is named Crusader, but this may be a template or sentinel row rather than a literal spawn target.</dd>`
      : "";
    return `
        <dt>NPC</dt><dd>${escapeHtml(npcValue)}</dd>${npcShapeRow}${crusaderRowNote}
        <dt>Map</dt><dd>${escapeHtml(formatNumericField(item.mapNum))}</dd>
        <dt>Quality</dt><dd>${escapeHtml(formatNumericField(item.quality))}</dd>${frameNoteRow}
      `;
  }

  function renderChestSpawnerMetadataRows(item, definition = null) {
    if (definition?.shape !== CHEST_ITEM_SPAWNER_SHAPE || !item?.itemPreview) {
      return "";
    }

    const previewDisplay = getLinkedPreviewDisplay(item.itemPreview);
    if (!previewDisplay) {
      return "";
    }

    const rawFrameSuffix = Number.isInteger(item.itemPreview.rawFrame) && item.itemPreview.rawFrame !== item.itemPreview.frame
      ? ` (raw ${item.itemPreview.rawFrame})`
      : "";
    const qualityKey = item.quality & 0xff;

    return `
        <dt>Chest item</dt><dd>${escapeHtml(previewDisplay.displayName)}</dd>
        <dt>Chest item shape</dt><dd>${escapeHtml(`${previewDisplay.shapeHex} frame ${item.itemPreview.frame}${rawFrameSuffix}`)}</dd>
        <dt>Chest match key</dt><dd>${escapeHtml(`QLo ${qualityKey}`)}</dd>
      `;
  }

  function getMonsterSpawnerSignalKey(item) {
    return Number.isInteger(item?.quality) ? (item.quality & 0xff) : null;
  }

  function getMonsterSpawnerItems() {
    return getMonsterSpawnerAnalysis().items;
  }

  function getMonsterSpawnerPairCandidates(item) {
    const signalKey = getMonsterSpawnerSignalKey(item);
    const analysis = getMonsterSpawnerAnalysis();
    if (!state.current || !Number.isInteger(signalKey)) {
      return [];
    }

    const cached = analysis.pairCandidatesById.get(item.id);
    if (cached) {
      return cached;
    }

    const pairCandidates = (analysis.bySignalKey.get(signalKey) ?? []).filter((candidate) => {
      if (candidate.id === item.id) {
        return false;
      }
      if (candidate.frame === item.frame) {
        return false;
      }
      if (getMonsterSpawnerSignalKey(candidate) !== signalKey) {
        return false;
      }
      return Math.hypot(candidate.world.x - item.world.x, candidate.world.y - item.world.y) <= MONSTER_SPAWNER_PAIR_MAX_DISTANCE;
    });

    analysis.pairCandidatesById.set(item.id, pairCandidates);
    return pairCandidates;
  }

  function getMonsterSpawnerLikelySpawnOwner(item) {
    const analysis = getMonsterSpawnerAnalysis();
    if (!isMonsterSpawnerItem(item, getShapeDefinition(item?.shapeDefId))) {
      return { item: null, ambiguous: false, pairCount: 0, basis: "none" };
    }
    const cached = analysis.likelySpawnOwnerById.get(item.id);
    if (cached) {
      return cached;
    }

    const selfNpcInfo = getNpcSpawnerInfoForItem(item, getShapeDefinition(item?.shapeDefId));
    const pairCandidates = getMonsterSpawnerPairCandidates(item)
      .sort((left, right) => getMonsterSpawnerPairDistance(item, left) - getMonsterSpawnerPairDistance(item, right));
    const frameZeroCandidates = pairCandidates.filter((candidate) => candidate.frame === 0);
    const frameOneCandidates = pairCandidates.filter((candidate) => candidate.frame === 1);
    const nearestFrameZero = frameZeroCandidates[0] ?? null;
    const nearestFrameOne = frameOneCandidates[0] ?? null;
    const nearestFrameOneNpcInfo = nearestFrameOne ? getNpcSpawnerInfoForItem(nearestFrameOne, getShapeDefinition(nearestFrameOne.shapeDefId)) : null;
    const nearestFrameZeroNpcInfo = nearestFrameZero ? getNpcSpawnerInfoForItem(nearestFrameZero, getShapeDefinition(nearestFrameZero.shapeDefId)) : null;
    const controller = item?.frame === 0 ? item : nearestFrameZero;
    const controllerEnabled = controller ? isMonsterSpawnerAutoEnterEnabled(controller) : true;
    let result;

    if (item?.frame === 0) {
      if (nearestFrameOne && nearestFrameOneNpcInfo) {
        result = {
          item: nearestFrameOne,
          ambiguous: frameOneCandidates.length > 1,
          pairCount: frameOneCandidates.length,
          basis: controllerEnabled ? "paired-frame1-auto" : "paired-frame1-signaled"
        };
        analysis.likelySpawnOwnerById.set(item.id, result);
        return result;
      }
      result = {
        item,
        ambiguous: false,
        pairCount: Math.max(frameOneCandidates.length, 1),
        basis: controllerEnabled ? "self-frame0" : "self-frame0-blocked"
      };
      analysis.likelySpawnOwnerById.set(item.id, result);
      return result;
    }

    if (selfNpcInfo) {
      result = {
        item,
        ambiguous: frameZeroCandidates.length > 1,
        pairCount: Math.max(frameZeroCandidates.length, 1),
        basis: controllerEnabled ? "self-frame1-auto" : "self-frame1-signaled"
      };
      analysis.likelySpawnOwnerById.set(item.id, result);
      return result;
    }

    if (nearestFrameZeroNpcInfo) {
      result = {
        item: nearestFrameZero,
        ambiguous: frameZeroCandidates.length > 1,
        pairCount: frameZeroCandidates.length,
        basis: "nearest-frame0"
      };
      analysis.likelySpawnOwnerById.set(item.id, result);
      return result;
    }

    result = {
      item: item ?? null,
      ambiguous: frameZeroCandidates.length > 1,
      pairCount: frameZeroCandidates.length,
      basis: item?.frame === 1 ? "self-frame1-fallback" : "fallback"
    };
    analysis.likelySpawnOwnerById.set(item.id, result);
    return result;
  }

  function renderMonsterSpawnerActivationRows(item, definition = null) {
    if (!isMonsterSpawnerItem(item, definition)) {
      return "";
    }

    const qLo = item.quality & 0xff;
    const enterAreaNote = isMonsterSpawnerAutoEnterEnabled(item)
      ? "mapNum bit 0x08 clear"
      : "mapNum bit 0x08 set";
    const pairCandidates = getMonsterSpawnerPairCandidates(item);
    const practicalPreview = getMonsterSpawnerLikelySpawnOwner(item);
    const practicalNpcInfo = practicalPreview.item ? getNpcSpawnerInfoForItem(practicalPreview.item, definition) : null;
    const qLoNote = qLo >= 0 && qLo <= 2
      ? `<dt>QLo hint</dt><dd>Low quality ${escapeHtml(qLo)} is in the small 0/1/2 lane that Regret ALARMHAT difficulty-gates before equipping nearby 0x04D0 objects.</dd>`
      : "";
    const pairCandidateNote = pairCandidates.length
      ? `<dt>Pair candidates</dt><dd>${escapeHtml(`${pairCandidates.length} nearby opposite-frame 0x04D0 item${pairCandidates.length === 1 ? "" : "s"} share this QLo link key.`)}</dd>`
      : "";
    const spawnRoleNote = item.frame === 0
      ? "Frame 0 is the verified enter-area controller lane. The viewer no longer assumes that its NPC row is always the visible monster in paired authored setups."
      : "Frame 1 is the current practical-preview side for confirmed auto-enabled pairs, but the underlying create path is still not fully closed at the field-by-field level.";
    const practicalPreviewRow = practicalPreview.item
      ? `<dt>Practical preview</dt><dd>${escapeHtml(`${practicalNpcInfo ? practicalNpcInfo.name : formatNumericField(practicalPreview.item.npcNum)}${practicalPreview.ambiguous ? ` (${practicalPreview.basis}, nearest of ${practicalPreview.pairCount})` : ` (${practicalPreview.basis})`}`)}</dd>`
      : "";
    const stateLabel = item.frame === 0
      ? (isMonsterSpawnerAutoEnterEnabled(item) ? "☑ auto-enabled" : "☒ dormant until signaled")
      : `◌ frame ${formatNumericField(item.frame)} pair state`;

    return `
        <dt>Activation</dt><dd>${escapeHtml(getMonsterSpawnerActivationSummary(item))}</dd>
        <dt>Spawn state</dt><dd>${escapeHtml(stateLabel)}</dd>
        <dt>Enter-area gate</dt><dd>${escapeHtml(enterAreaNote)}</dd>
        <dt>Signal key</dt><dd>${escapeHtml(String(qLo))}</dd>
        <dt>Viewer stance</dt><dd>${escapeHtml(spawnRoleNote)}</dd>${practicalPreviewRow}${qLoNote}${pairCandidateNote}
      `;
  }

  function renderMonsterSpawnerEditor(item, definition = null, hasEditableRecord = false) {
    if (!isMonsterSpawnerItem(item, definition) || !hasEditableRecord) {
      return "";
    }

    const frameOptions = [0, 1].map((value) => {
      const label = value === 0 ? "Frame 0: enter-area checked" : "Frame 1: skip enter-area";
      return `<option value="${value}" ${item.frame === value ? "selected" : ""}>${label}</option>`;
    }).join("");
    const enterMode = isMonsterSpawnerAutoEnterEnabled(item) ? "auto" : "blocked";

    return `
      <div class="tooltip-spawner-editor">
        <label class="tooltip-field tooltip-grid-field">
          <span class="tooltip-grid-field-label">Spawner frame</span>
          <select class="tooltip-field-input" data-monster-spawner-frame>
            ${frameOptions}
          </select>
        </label>
        <label class="tooltip-field tooltip-grid-field">
          <span class="tooltip-grid-field-label">Enter-area lane</span>
          <select class="tooltip-field-input" data-monster-spawner-enter-mode>
            <option value="auto" ${enterMode === "auto" ? "selected" : ""}>Auto spawn on enter area</option>
            <option value="blocked" ${enterMode === "blocked" ? "selected" : ""}>Block auto spawn on enter area</option>
          </select>
        </label>
        <p class="tooltip-editor-note">Verified path: MONSTER.enterFastArea only checks frame 0, and it uses the automatic lane when mapNum bit 0x08 is clear.</p>
        <button class="tooltip-save-button" type="button" data-action="save-monster-spawner">Apply Spawner State</button>
      </div>
    `;
  }

  function formatDefinitionDimensions(definition) {
    const dimensions = definition?.dimensions;
    if (!dimensions) {
      return "";
    }
    return `${dimensions.x} x ${dimensions.y} x ${dimensions.z}`;
  }

  function formatByteHex(value) {
    return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
  }

  function formatWordHex(value) {
    return `0x${(value & 0xffff).toString(16).padStart(4, "0")}`;
  }

  function createUsecodeViewTarget(className, slot, eventNameHint, note, fallbackEventNameHints = []) {
    const eventLabel = eventNameHint || `slot_${slot.toString(16).padStart(2, "0")}`;
    return {
      className,
      slot,
      eventNameHint,
      fallbackEventNameHints,
      label: `${className}.${eventLabel}`,
      title: `Open ${className}.${eventLabel} in the USECODE viewer`,
      note
    };
  }

  function getQualityLowByte(item) {
    return Number.isInteger(item?.quality) ? (item.quality & 0xff) : null;
  }

  function getQualityHighByte(item) {
    return Number.isInteger(item?.quality) ? ((item.quality >> 8) & 0xff) : null;
  }

  function getShapeNumber(item) {
    const definition = getShapeDefinition(item?.shapeDefId);
    return Number.isInteger(definition?.shape) ? definition.shape : null;
  }

  function getFixedSceneItemId(item) {
    if (item?.source === "fixed" && Number.isInteger(item?.mapSourceIndex)) {
      return `fixed:${item.mapSourceIndex}`;
    }
    return null;
  }

  function getStableSceneItemId(item) {
    return getFixedSceneItemId(item) ?? item?.stableId ?? item?.id ?? "-";
  }

  function hasWorldPosition(item) {
    return Boolean(
      item?.world
      && Number.isFinite(item.world.x)
      && Number.isFinite(item.world.y)
      && Number.isFinite(item.world.z)
    );
  }

  function getWorldDistance(left, right) {
    if (!hasWorldPosition(left) || !hasWorldPosition(right)) {
      return Infinity;
    }
    return Math.hypot(left.world.x - right.world.x, left.world.y - right.world.y, left.world.z - right.world.z);
  }

  function collectNearbyLinkedItems(source, targetShapes, maxDistance = VALUEBOX_LINK_DISTANCE) {
    const qLo = getQualityLowByte(source);
    if (!state.current || !hasWorldPosition(source) || !Number.isInteger(qLo)) {
      return [];
    }

    const shapeSet = targetShapes instanceof Set ? targetShapes : new Set(targetShapes);
    return state.current.scene.items
      .filter((candidate) => {
        if (!candidate || candidate.id === source.id || !shapeSet.has(getShapeNumber(candidate))) {
          return false;
        }
        if (getQualityLowByte(candidate) !== qLo) {
          return false;
        }
        return getWorldDistance(source, candidate) <= maxDistance;
      })
      .map((candidate) => ({
        item: candidate,
        distance: getWorldDistance(source, candidate)
      }))
      .sort((left, right) => left.distance - right.distance);
  }

  function formatWorldPoint(world) {
    if (!world) {
      return "?, ?, ?";
    }
    return `${world.x},${world.y},${world.z}`;
  }

  function describeLinkedItem(item) {
    const definition = getShapeDefinition(item?.shapeDefId);
    const displayName = definition?.displayName || item?.shapeDefId || "item";
    return `${getStableSceneItemId(item)} (${displayName}) @ ${formatWorldPoint(item?.world)}`;
  }

  function getValueBoxTextMessageHint(messageId) {
    return Number.isInteger(messageId) ? (VALUEBOX_TEXTFILE_MESSAGE_HINTS.get(messageId) ?? null) : null;
  }

  function appendLinkedValueBoxRows(rows, item, controllerLabel) {
    const matches = collectNearbyLinkedItems(item, [VALUEBOX_SHAPE]);
    if (!matches.length) {
      return;
    }

    const nearest = matches[0].item;
    const nearestRawQuality = Number.isInteger(nearest?.quality) ? (nearest.quality & 0xffff) : null;
    const nearestQHi = getQualityHighByte(nearest);
    rows.push(`<dt>Local VALUEBOX</dt><dd>${escapeHtml(`${matches.length} nearby same-QLo VALUEBOX ${matches.length === 1 ? "match" : "matches"}; nearest ${describeLinkedItem(nearest)}${nearestRawQuality === null ? "" : `, raw ${formatWordHex(nearestRawQuality)}`}.`)}</dd>`);
    if (matches.length > 1) {
      rows.push(`<dt>Link warning</dt><dd>${escapeHtml(`${controllerLabel}.use warns when more than one nearby VALUEBOX shares the same local link id.`)}</dd>`);
    }
    const messageHint = getValueBoxTextMessageHint(nearestQHi);
    if (messageHint) {
      rows.push(`<dt>Linked text</dt><dd>${escapeHtml(`Nearest VALUEBOX QHi ${nearestQHi} selects TEXTFILE message ${nearestQHi}: ${messageHint}`)}</dd>`);
    }
  }

  function getCmdLinkMetadata(item) {
    const mapByte = Number.isInteger(item?.mapNum) ? (item.mapNum & 0xff) : null;
    const npcByte = Number.isInteger(item?.npcNum) ? (item.npcNum & 0xff) : null;
    const qLo = getQualityLowByte(item);
    const qHi = getQualityHighByte(item);

    if (mapByte === null || npcByte === null || qLo === null || qHi === null) {
      return null;
    }

    const targetCode = (((mapByte & 0xe0) * 8) + npcByte) & 0x7ff;
    const mode = mapByte & 0x03;
    const itemMode = Boolean(mapByte & 0x04);
    const phaseLane = (mapByte & 0x08) ? 0 : 1;
    const lowPriority = Boolean(mapByte & 0x10);
    const subcommand = qHi & 0x07;
    const subcommandArg = qHi >> 3;

    let targetKind = "exact-shape";
    let targetLabel = `Exact nearby shape ${formatWordHex(targetCode)}`;
    if (targetCode === 0x07ff) {
      targetKind = "family-1";
      targetLabel = "Family-1 target set sentinel (Crus-type NPC lane)";
    } else if (targetCode === 0x07fe) {
      targetKind = "family-6";
      targetLabel = "Family-6 target set sentinel (non-Crus NPC lane)";
    } else if (targetCode === 0x0000) {
      targetKind = "zero";
      targetLabel = "Zero target sentinel";
    }

    let subcommandLabel = `Subcommand ${subcommand}`;
    let subcommandNote = "Recovered TRIGGER lanes for this subcommand remain partly unresolved.";
    if (subcommand === 0) {
      subcommandLabel = `Subcommand 0 (arg ${subcommandArg})`;
      subcommandNote = "Helper dispatch lane. It scans nearby 0x0476 helpers that share this link id and forwards the arg into FREE.slot_30 using the helper's packed npc/map payload rather than editing the matched target directly.";
    } else if (subcommand === 1) {
      subcommandLabel = `Subcommand 1 (arg ${subcommandArg})`;
      subcommandNote = "Direct target-mutation lane. Depending on command mode it broadcasts across matched nearby items to set QHi, QLo, equip, frame, or a timed door pulse, or runs the same logic only on the exact triggering item.";
    } else if (subcommand === 2) {
      subcommandLabel = `Subcommand 2 (arg ${subcommandArg})`;
      subcommandNote = "Frame-set lane. The arg selects the frame value applied to matched targets in the direct item-targeting variant.";
    } else if (subcommand === 3) {
      subcommandLabel = `Subcommand 3 (arg ${subcommandArg})`;
      subcommandNote = "Timed pulse lane. It calls TRIGGER.slot_22 on matched targets, and that wrapper repeatedly drives DOOR.slot_21 for the arg-sized count while a busy/status bit is held.";
    } else if (subcommand === 4) {
      subcommandLabel = `Subcommand 4 (+${subcommandArg})`;
      subcommandNote = "Link-rewrite lane. It adds the arg value to the current QLo/link id and immediately continues the scan with the new link.";
    } else if (subcommand === 5) {
      subcommandLabel = `Subcommand 5 (-${subcommandArg})`;
      subcommandNote = "Link-rewrite lane. It subtracts the arg value from the current QLo/link id and immediately continues the scan with the new link.";
    } else if (subcommand === 6) {
      subcommandLabel = `Subcommand 6 (arg ${subcommandArg})`;
      subcommandNote = "Create-and-drop lane. It resolves payload data through nearby 0x0476 helpers, creates the target item when the packed map byte allows it, copies Q, moves it to the helper coordinates, then unequips/drops it with the arg-sized count.";
    }

    return {
      qLo,
      qHi,
      mapByte,
      npcByte,
      targetCode,
      targetKind,
      targetLabel,
      mode,
      itemMode,
      phaseLane,
      lowPriority,
      subcommand,
      subcommandArg,
      subcommandLabel,
      subcommandNote
    };
  }

  function getCmdLinkCandidateSummary(item) {
    if (!state.current) {
      return null;
    }

    const metadata = getCmdLinkMetadata(item);
    if (!metadata || metadata.targetKind !== "exact-shape") {
      return null;
    }

    const matchingShape = [];
    const matchingLink = [];
    for (const candidate of state.current.scene.items) {
      if (candidate.id === item.id) {
        continue;
      }
      const candidateShape = getShapeNumber(candidate);
      if (candidateShape !== metadata.targetCode) {
        continue;
      }
      const distance = Math.hypot(candidate.world.x - item.world.x, candidate.world.y - item.world.y);
      if (distance > CMD_LINK_MAX_DISTANCE) {
        continue;
      }
      matchingShape.push(candidate);
      if (metadata.qLo === 0xff || getQualityLowByte(candidate) === metadata.qLo) {
        matchingLink.push(candidate);
      }
    }

    if (!matchingShape.length) {
      return {
        ...metadata,
        matchingShape,
        matchingLink,
        preview: []
      };
    }

    const preview = matchingLink.slice(0, 3).map((candidate) => {
      const definition = getShapeDefinition(candidate.shapeDefId);
      const name = definition?.displayName || candidate.shapeDefId;
      const qLo = getQualityLowByte(candidate);
      return `${name} @ ${formatWorldCoords(candidate.world)}${qLo === null ? "" : `, QLo ${qLo}`}`;
    });

    return {
      ...metadata,
      matchingShape,
      matchingLink,
      preview
    };
  }

  function getDefinitionTraitLabels(definition) {
    if (!definition?.traits) {
      return [];
    }
    const traits = [];
    if (definition.traits.occluding) {
      traits.push("occluding");
    }
    if (definition.traits.translucent) {
      traits.push("translucent");
    }
    if (definition.traits.solid) {
      traits.push("solid");
    }
    if (definition.traits.fixed) {
      traits.push("fixed");
    }
    if (definition.traits.land) {
      traits.push("land");
    }
    if (definition.traits.draw) {
      traits.push("draw");
    }
    if (definition.traits.invitem) {
      traits.push("inventory-item");
    }
    if (Number.isInteger(definition.traits.animType) && definition.traits.animType !== 0) {
      traits.push(`anim:${definition.traits.animType}`);
    }
    return traits;
  }

  function getDefinitionRoleHint(item, definition) {
    if (!definition) {
      return "";
    }
    if (definition.shape === VALUEBOX_SHAPE) {
      return "VALUEBOX local payload box; nearby controllers match it by QLo, pass QHi into TEXTFILE.slot_23 as a selector byte, and rely on VALBOX.slot_20(...) for the still-partially-opaque numeric/passcode payload.";
    }
    if (definition.shape === BOX_EW_SHAPE) {
      return "BOX_EW switch family; use() only fires while map-array is clear, dispatching TRIGGER lane 1 from frame 0 and lane 0 from nonzero frames. Sampled scenes only justify same-QLo cmd-link arrows for frame 0.";
    }
    if (definition.shape === MONITNS_SHAPE) {
      return "MONITNS monitor/computer-adjacent object; the live MONITNS.use body makes this a stronger first-view gameplay script target than generic chest props.";
    }
    if (definition.shape === MONITEW_SHAPE) {
      return "MONITEW monitor/computer-adjacent object; the east-west variant also has a live use handler and sits in the same practical viewer family as MONITNS.";
    }
    if (definition.shape === FASTSKIL_SHAPE) {
      return "FASTSKIL fast-area trigger gate; enterFastArea waits briefly, uses difficulty to choose trigger lane or remap QLo, and frame 2 exposes explicit diff1/diff2/diff3+ link lanes.";
    }
    if (definition.shape === MONSTER_SPAWNER_SHAPE) {
      return "MONSTER helper/spawner; frame 0 is the verified automatic enter-area controller lane, while the paired frame-1 record is currently the stronger practical NPC preview in confirmed auto-enabled examples. Clear mapNum bit 0x08 enables the automatic enter-area path.";
    }
    if (definition.shape === PANELNS_SHAPE) {
      return "PANELNS switch/panel controller; its use() lane forwards the local QLo key through nearby trigger helpers rather than acting as a plain decorative panel.";
    }
    if (definition.shape === PANELEW_SHAPE) {
      return "PANELEW east-west panel switch; nonzero frames with clear map state dispatch TRIGGER lane 0, so the local QLo stays the practical authored link id just like PANELNS.";
    }
    if (definition.shape === CRUMORPH_SHAPE) {
      return "CRUMORPH control-transfer pad; equip scans nearby NPCs for a local-Qlo-matched actor key held in mutable actor field 0x63, temporarily hands player control to that NPC, and then brackets TRIGGER.slot_20 with success or failure lanes. Static scene export still cannot prove the actor side of that match.";
    }
    if (definition.shape === NPCTRIG_SHAPE) {
      return "NPCTRIG compact event-bearing trigger object; slot 0x0A is the strongest current active-event body and slot 0x20 acts as the paired helper lane.";
    }
    if (definition.shape === CRUZTRIG_SHAPE) {
      return "CRUZTRIG trigger/helper object; the recovered gotHit body makes this a concrete trigger-bearing gameplay object rather than a generic editor placeholder.";
    }
    if (definition.shape === VMAIL_SHAPE) {
      return "VMAIL voice/mail helper object; the active known body is slot 0x0A, making it a valid first-view usecode target even though the exact event semantics are still weaker than the slot number.";
    }
    if (definition.shape === CARD_NS_SHAPE) {
      return "CARD_NS keyed switch controller; the thin use() wrapper immediately hands off into the downstream SWITCH/TRIGGER chain keyed by local QLo.";
    }
    if (definition.shape === NUMBERS_SHAPE) {
      return "Tiny readout/number helper family; glyph-sized markers that cluster beside nearby 0x0501/0x0502/0x0503/0x0505/0x0507 display pieces rather than the trigger-link helper network.";
    }
    if (definition.shape === SKILLBOX_SHAPE) {
      return "SKILLBOX difficulty/skill gate; frame 0 and 1 switch trigger lanes by difficulty, and frame 2 remaps QLo before dispatch.";
    }
    if (definition.shape === CHEST_NS_SHAPE || definition.shape === CHEST_EW_SHAPE) {
      return "Chest object; use opens the chest, plays the local animation/audio path, and can spawn contents through FREE rather than behaving like a simple decorative container.";
    }
    if (definition.shape === CMD_LINK_SHAPE) {
      return "Trigger/link controller; TRIGGER reads QLo as the link id, uses mapNum low bits as phase and routing flags, and derives the target search shape from npcNum plus mapNum high bits.";
    }
    if (definition.shape === EVENT_SHAPE) {
      return "EVENT controller; a generic scripted event multiplexer that reuses QLo as a local link id and can drive triggers, doors, camera, audio, and nearby helper shapes.";
    }
    if (definition.shape === NPC_ONLY_SHAPE) {
      return "NPC_ONLY trigger helper; its active gotHit() body compares the pad's local QLo against mutable actor field 0x63 and reacts to scripted hit routing rather than direct player use. Static scene export still cannot prove the actor side of that match.";
    }
    if (definition.shape === SPANEL_SHAPE) {
      return "SPANEL switch controller; its use() body participates in the same local QLo trigger-helper network as PANELNS and CARD_NS.";
    }
    if (definition.shape === GENERATR_SHAPE) {
      return "GENERATR destroyable generator/controller; gotHit immediately excludes the source item and dispatches TRIGGER lane 0, and SATARG also scans nearby 0x03C1 placements during its scripted shutdown sequence.";
    }
    if (definition.shape === FLAMEBOX_SHAPE) {
      return "FLAMEBOX hazard controller; equip scans nearby flame-family helpers by shared QLo and can swap helper markers into active flame actors.";
    }
    if (definition.shape === TIMER_SHAPE) {
      const timer = getTimerMetadata(item);
      if (timer) {
        return `TIMER fast-area helper; mapNum:npcNum pack a ${timer.packedDelay}-tick base delay, qHi tier ${timer.trimTier} trims that by ${timer.trimPercent}%, and the low qHi bits arm enter/leave/repeat routing into TRIGGER.slot_20.`;
      }
      return "TIMER fast-area helper; enter/leave-area hooks arm a delayed TRIGGER.slot_20 dispatch instead of behaving like a plain editor marker.";
    }
    if (definition.shape === SPECIAL_SHAPE) {
      const special = getSpecialMetadata(item);
      if (special) {
        return `SPECIAL fast-area helper; mapNum and npcNum are phase bytes, qHi is the delay byte, and the helper can either fire direct 0x80/0x81 TRIGGER.slot_20 lanes or loop through SPECIAL.slot_21 state progression.`;
      }
      return "SPECIAL fast-area helper; mapNum/npcNum act like phase bytes rather than DTABLE rows, and the family fans out through TRIGGER.slot_20 and SPECIAL.slot_21.";
    }
    if (definition.shape === TRIGPAD_SHAPE) {
      return "TRIGPAD occupancy/surface-gated trigger pad; gotHit waits briefly, dispatches trigger lanes 0 then 1, and can prod nearby elevator helpers. Broader scene sweeps did not justify a generic cmd-link arrow rule.";
    }
    if (definition.shape === DOOR_DEATH_HELPER_SHAPE) {
      return "Destroyable-door helper; DOOR.slot_23 scans nearby 0x04F8 items with matching QLo and dispatches trigger lane 0 or +0x80 by map-array state after the door damage path.";
    }
    if (definition.shape === SFXTRIG_SHAPE) {
      return "SFXTRIG minimal event-core helper; the active low slot is event 0x0A, and this family is one of the compact event-bearing controller records beside broader EVENT/NPCTRIG hubs.";
    }
    if (definition.shape === DEATHBOX_SHAPE) {
      return "DEATHBOX NPC-death helper; slot 0x0A is the recovered helper body that matches death-link QLo and forwards into TRIGGER lanes from NPC death events.";
    }
    if (definition.shape === BRO_BOOT_SHAPE) {
      return "BRO_BOOT helper; enterFastArea scans nearby SPANEL items by shared QLo, toggles their ITEM control slots, and runs its own boot-sequence animation.";
    }
    if (definition.shape === STEAMBOX_SHAPE) {
      return "STEAMBOX hazard controller; nearby steam-family helpers are matched by QLo and dispatched through STEAMBOX control slots.";
    }
    if (definition.shape === WATCHNS_SHAPE) {
      return "WATCHNS secret-door watcher; slot 0x20 scans nearby 0x0510 posts by shared QLo, uses qHi-0 posts as the local text/door marker lane, then brackets TRIGGER.slot_20 around its watcher slot 0x21 phase. Its follow-up watcher lane also compares nearby actor field 0x63 against the controller QLo, but the current viewer keeps that actor side metadata-only.";
    }
    if (definition.shape === WATCHEW_SHAPE) {
      return "WATCHEW secret-door watcher; the east-west variant uses the same nearby 0x0510 post scan and TRIGGER.slot_20 fan-out as WATCHNS. Its follow-up watcher lane also compares nearby actor field 0x63 against the controller QLo, but the current viewer keeps that actor side metadata-only.";
    }
    if (definition.shape === SECRET_DOOR_POST_SHAPE) {
      return "Secret-door post/helper; nearby WATCHNS and WATCHEW controllers match these posts by local QLo, and qHi-0 placements are the text/door-side marker lane in the recovered watcher body.";
    }
    if (definition.shape === CRAZYEW_SHAPE) {
      return "CRAZYEW NPC wake-up relay; gotHit checks actor handles >= 0x00ff and nudges eligible NPCs into slot 0x2C unless they are already in activity 12.";
    }
    if (definition.shape === VIDEOBOX_SHAPE) {
      return "VIDEOBOX gated controller; equip is a thin global-flag check that either falls straight into ITEM.slot_21 or runs a short scripted helper loop first.";
    }
    if (definition.shape === ALARMHAT_SHAPE) {
      return "ALARMHAT local alarm driver; equips nearby 0x04D0 helpers and uses frame-dependent gating rather than DTABLE NPC payloads.";
    }
    if (definition.shape === ALRMTRIG_SHAPE) {
      return "ALRMTRIG alert relay; chooses trigger lanes 0/1 or +0x80/+0x81 from map-array state and the current world alert flag.";
    }
    if (definition.shape === CRAZYNS_SHAPE) {
      return "CRAZYNS NPC wake-up relay; gotHit checks actor handles >= 0x00ff and nudges eligible NPCs into slot 0x2C unless they are already in activity 12.";
    }
    if (definition.shape === PRESSURE_BARRIER_V_SHAPE || definition.shape === PRESSURE_BARRIER_H_SHAPE) {
      return "Pressure-barrier face; CRYOBOX equips nearby 0x05DF/0x05E0 faces by shared QLo and then drives their open/steam animation lane through slots 0x20 and 0x21.";
    }
    if (definition.shape === CRYOBOX_SHAPE) {
      return "CRYOBOX pressure-barrier switch; equip matches nearby 0x05DF/0x05E0 faces by shared QLo, then drives their open/close worker slots and steam release timing.";
    }
    if (definition.shape === CHEST_ITEM_SPAWNER_SHAPE) {
      return "Chest item spawner; chest usecode matches nearby 0x0476 helpers by QLo and FREE.slot_2E resolves the spawned item from mapNum/npcNum.";
    }
    if (definition.shape === 0x04d0) {
      return "Editor/controller NPC spawner using DTABLE-backed npcNum rows.";
    }
    if (definition.shape === MONSTER_EGG_PREVIEW_SHAPE && item.egg?.type === "monster-spawn") {
      return "Monster egg spawn entry; egg ID comes from mapNum >> 3 and Remorse can still use npcNum as a DTABLE actor row.";
    }
    if (definition.shape === USECODE_TRIGGER_EGG_SHAPE && item.egg?.type === "usecode-trigger") {
      const range = getUsecodeTriggerEggRange(item);
      const subtype = getUsecodeTriggerEggSubtypeInfo(item, state.current?.selected?.game ?? null);
      if (range) {
        const subtypeText = subtype?.className
          ? ` QLo ${subtype.qLo} selects ${subtype.className} at class ${formatWordHex(subtype.classId)}.`
          : "";
        return `Usecode-trigger proximity egg; mapNum is the egg id, npcNum packs X/Y trigger range nibbles, and the inspect overlay shows the current footprint (${range.worldXRange} x ${range.worldYRange} world units, +/- ${range.zWindow} Z).${subtypeText}`;
      }
      if (subtype?.className) {
        return `Usecode-trigger proximity egg; mapNum is the egg id, QLo selects ${subtype.className} at class ${formatWordHex(subtype.classId)}, and npcNum packs the X/Y trigger range nibbles used by the runtime egg-hatcher checks.`;
      }
      return "Usecode-trigger proximity egg; mapNum is the egg id, QLo selects the family-4 class at 0x0900 + QLo, and npcNum packs the X/Y trigger range nibbles used by the runtime egg-hatcher checks.";
    }

    const catalogText = [definition.displayName, definition.description, definition.catalogEntry?.humanReadableId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (catalogText.includes("invisible_wall") || catalogText.includes("invisible wall") || catalogText.includes("editor_wall")) {
      return "Catalog tags this as an invisible/editor wall helper rather than visible world art.";
    }
    if (catalogText.includes("camera")) {
      return "Catalog tags this as a camera/helper marker.";
    }
    if (catalogText.includes("light_bridge") || catalogText.includes("light bridge")) {
      return "Catalog tags this as a light-bridge editor marker.";
    }
    if (catalogText.includes("placeholder")) {
      return "Catalog tags this as a placeholder/editor marker.";
    }
    if (catalogText.includes("wallgun_shape")) {
      return "Auto-derived helper shape associated with WALLGUN self-shape usage in USECODE.";
    }
    if (definition.kind === "helper") {
      return "Helper-class placement; likely used for logic, markers, or invisible support geometry.";
    }
    if (definition.kind === "editor") {
      return "Editor-class placement; usually authored as a visible or semi-visible map-editing aid.";
    }
    if (definition.kind === "egg") {
      return "Egg-family placement; map, npc, and quality fields are interpreted by egg-family rules rather than one global schema.";
    }
    return "";
  }

  function getUsecodeViewTarget(item, definition = null) {
    if (!definition) {
      return null;
    }

    if (definition.shape === VALUEBOX_SHAPE) {
      return createUsecodeViewTarget("VALUEBOX", 0x20, null, "VALUEBOX.slot_20 is the still-partially-opaque data codec that nearby monitors, watchers, and keypads call after matching the box by QLo.", ["cachein"]);
    }

    if (definition.shape === USECODE_TRIGGER_EGG_SHAPE && item?.egg?.type === "usecode-trigger") {
      const subtype = getUsecodeTriggerEggSubtypeInfo(item, state.current?.selected?.game ?? null);
      if (subtype?.className && Number.isInteger(subtype.slot)) {
        return createUsecodeViewTarget(subtype.className, subtype.slot, subtype.eventNameHint, subtype.note);
      }
    }

    if (definition.shape === BOX_EW_SHAPE) {
      return createUsecodeViewTarget("BOX_EW", 0x01, "use", "Frame-0 BOX_EW switches dispatch their local link through BOX_EW.use before forwarding into TRIGGER.slot_20.");
    }
    if (definition.shape === MONITNS_SHAPE) {
      return createUsecodeViewTarget("MONITNS", 0x01, "use", "MONITNS.use is a live computer-adjacent gameplay handler and is the strongest current first-view target for monitor objects.");
    }
    if (definition.shape === MONITEW_SHAPE) {
      return createUsecodeViewTarget("MONITEW", 0x01, "use", "MONITEW.use is the east-west monitor variant's live computer-adjacent gameplay handler.");
    }
    if (definition.shape === FASTSKIL_SHAPE) {
      return createUsecodeViewTarget("FASTSKIL", 0x0f, "enterFastArea", "FASTSKIL gates difficulty routing in enterFastArea, including the verified QLo/+1/+2 remap lane.");
    }
    if (definition.shape === MONSTER_SPAWNER_SHAPE && item?.frame === 0) {
      return createUsecodeViewTarget("MONSTER", 0x0f, "enterFastArea", "Frame-0 0x04D0 spawners participate in the verified MONSTER.enterFastArea auto-spawn lane when mapNum bit 0x08 is clear.");
    }
    if (definition.shape === PANELNS_SHAPE) {
      return createUsecodeViewTarget("PANELNS", 0x01, "use", "PANELNS.use is the recovered panel-switch wrapper that passes the local QLo key into the trigger chain.");
    }
    if (definition.shape === PANELEW_SHAPE) {
      return createUsecodeViewTarget("PANELEW", 0x01, "use", "PANELEW.use is the east-west panel-switch wrapper; nonzero frames with clear map state forward the local QLo key into TRIGGER.slot_20 lane 0.");
    }
    if (definition.shape === CRUMORPH_SHAPE) {
      return createUsecodeViewTarget("CRUMORPH", 0x0a, "equip", "CRUMORPH.equip scans nearby NPCs for the pad's local-Qlo control key, transfers control to the first live match, and then dispatches TRIGGER.slot_20 lane 0 or 1.");
    }
    if (definition.shape === NPCTRIG_SHAPE) {
      return createUsecodeViewTarget("NPCTRIG", 0x0a, "equip", "NPCTRIG.equip is the strongest compact active-event body currently recovered for this trigger family.");
    }
    if (definition.shape === CRUZTRIG_SHAPE) {
      return createUsecodeViewTarget("CRUZTRIG", 0x06, "gotHit", "CRUZTRIG.gotHit is the recovered active body for this trigger/helper family.");
    }
    if (definition.shape === VMAIL_SHAPE) {
      return createUsecodeViewTarget("VMAIL", 0x0a, null, "VMAIL slot 0x0A is the live helper body for this voice/mail object family.");
    }
    if (definition.shape === CARD_NS_SHAPE) {
      return createUsecodeViewTarget("CARD_NS", 0x01, "use", "CARD_NS.use is the verified thin wrapper into the same SWITCH/TRIGGER path; Regret also has a cast body if the use wrapper is absent.", ["cast"]);
    }
    if (definition.shape === EVENT_SHAPE) {
      return createUsecodeViewTarget("EVENT", 0x0a, "equip", "EVENT.equip is the big multiplexer body used by recovered local event controllers.");
    }
    if (definition.shape === NPC_ONLY_SHAPE) {
      return createUsecodeViewTarget("NPC_ONLY", 0x06, "gotHit", "NPC_ONLY.gotHit is the recovered active body for hit-driven helper triggers.");
    }
    if (definition.shape === SPANEL_SHAPE) {
      return createUsecodeViewTarget("SPANEL", 0x01, "use", "SPANEL.use participates in the same nearby cmd-helper routing as PANELNS and CARD_NS.");
    }
    if (definition.shape === GENERATR_SHAPE) {
      return createUsecodeViewTarget("GENERATR", 0x06, "gotHit", "GENERATR.gotHit is the recovered destroyable generator lane; it excludes the source item and immediately dispatches TRIGGER.slot_20 lane 0.");
    }
    if (definition.shape === FLAMEBOX_SHAPE) {
      return createUsecodeViewTarget("FLAMEBOX", 0x0a, "equip", "FLAMEBOX.equip is the recovered local flame-controller body that scans nearby helper shapes by shared QLo.");
    }
    if (definition.shape === TRIGPAD_SHAPE) {
      return createUsecodeViewTarget("TRIGPAD", 0x06, "gotHit", "TRIGPAD.gotHit contains the occupancy-gated pad logic plus the recovered trigger-lane dispatches.");
    }
    if (definition.shape === CMD_LINK_SHAPE) {
      return createUsecodeViewTarget("TRIGGER", 0x20, null, "TRIGGER.slot_20 is the shared high-slot fan-out lane that nearby controller objects keep spawning on matched link ids.");
    }
    if (definition.shape === TIMER_SHAPE) {
      return createUsecodeViewTarget("TIMER", 0x0f, "enterFastArea", "TIMER.enterFastArea is the first active body for this fast-area timer family; it arms slot 0x20 from qHi flags and the packed mapNum:npcNum delay payload.");
    }
    if (definition.shape === SPECIAL_SHAPE) {
      return createUsecodeViewTarget("SPECIAL", 0x0f, "enterFastArea", "SPECIAL.enterFastArea is the first active body for this phase helper family; it reads mapNum/npcNum phase bytes and qHi delay before fanning out through TRIGGER.slot_20 and SPECIAL.slot_21.");
    }
    if (definition.shape === SKILLBOX_SHAPE) {
      return createUsecodeViewTarget("SKILLBOX", 0x0a, "equip", "SKILLBOX.equip is the verified skill-gated controller body for the recovered difficulty switch family.");
    }
    if (definition.shape === CHEST_NS_SHAPE) {
      return createUsecodeViewTarget("CHEST_NS", 0x01, "use", "CHEST_NS.use is the live chest-open handler that drives the animation/audio path and content spawn flow.");
    }
    if (definition.shape === CHEST_EW_SHAPE) {
      return createUsecodeViewTarget("CHEST_EW", 0x01, "use", "CHEST_EW.use is the live chest-open handler that drives the animation/audio path and content spawn flow.");
    }
    if (definition.shape === SFXTRIG_SHAPE) {
      return createUsecodeViewTarget("SFXTRIG", 0x0a, null, "SFXTRIG slot 0x0A is the active minimal event-core body for this local sound/trigger helper family.");
    }
    if (definition.shape === DEATHBOX_SHAPE) {
      return createUsecodeViewTarget("DEATHBOX", 0x0a, null, "DEATHBOX slot 0x0A is the recovered NPC-death helper body that matches death-link QLo and forwards into TRIGGER lanes.");
    }
    if (definition.shape === BRO_BOOT_SHAPE) {
      return createUsecodeViewTarget("BRO_BOOT", 0x0f, "enterFastArea", "BRO_BOOT.enterFastArea is the recovered helper body that toggles nearby SPANEL items by shared QLo.");
    }
    if (definition.shape === STEAMBOX_SHAPE) {
      return createUsecodeViewTarget("STEAMBOX", 0x0a, "equip", "STEAMBOX.equip is the recovered hazard-controller body that routes nearby steam helpers through event 0/1 lanes.");
    }
    if (definition.shape === WATCHNS_SHAPE) {
      return createUsecodeViewTarget("WATCHNS", 0x20, null, "WATCHNS.slot_20 is the recovered secret-door watcher lane that scans nearby 0x0510 posts by shared QLo before bracketing TRIGGER.slot_20.");
    }
    if (definition.shape === WATCHEW_SHAPE) {
      return createUsecodeViewTarget("WATCHEW", 0x20, null, "WATCHEW.slot_20 is the east-west secret-door watcher lane that scans nearby 0x0510 posts by shared QLo before bracketing TRIGGER.slot_20.");
    }
    if (definition.shape === CRAZYEW_SHAPE) {
      return createUsecodeViewTarget("CRAZYEW", 0x06, "gotHit", "CRAZYEW.gotHit is the recovered NPC wake-up relay for this Regret-only controller family.");
    }
    if (definition.shape === VIDEOBOX_SHAPE) {
      return createUsecodeViewTarget("VIDEOBOX", 0x0a, "equip", "VIDEOBOX.equip is the recovered gated helper body for this Regret-only controller family.");
    }
    if (definition.shape === ALARMHAT_SHAPE) {
      return createUsecodeViewTarget("ALARMHAT", 0x0a, "equip", "ALARMHAT.equip is the verified local alarm scan that walks nearby 0x04D0 helpers.");
    }
    if (definition.shape === ALRMTRIG_SHAPE) {
      return createUsecodeViewTarget("ALRMTRIG", 0x0a, "equip", "ALRMTRIG.equip is the recovered alert relay that selects TRIGGER lanes from map-array and world-alert state.");
    }
    if (definition.shape === CRAZYNS_SHAPE) {
      return createUsecodeViewTarget("CRAZYNS", 0x06, "gotHit", "CRAZYNS.gotHit is the recovered NPC wake-up relay for this Regret-only controller family.");
    }
    if (definition.shape === CRYOBOX_SHAPE) {
      return createUsecodeViewTarget("CRYOBOX", 0x0a, "equip", "CRYOBOX.equip is the recovered pressure-barrier controller body that matches nearby 0x05DF/0x05E0 faces by shared QLo.");
    }

    return null;
  }

  function renderSpecialEditorRows(item, definition = null) {
    if (!definition) {
      return "";
    }

    const rows = [];
    const rawQuality = Number.isInteger(item?.quality) ? (item.quality & 0xffff) : null;
    const qLo = rawQuality === null ? null : (rawQuality & 0xff);
    const qHi = rawQuality === null ? null : ((rawQuality >> 8) & 0xff);
    const rawMapNum = Number.isInteger(item?.mapNum) ? (item.mapNum & 0xff) : null;

    if (definition.shape === VALUEBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>VALUEBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Stored bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Codec note</dt><dd>Recovered VALUEBOX.cachein first calls VALBOX.slot_20 on the box itself; if that decode comes back zero it seeds a replacement through FREE.slot_20(0x0383) and VALUEBOX.slot_20(...).</dd>");
      const messageHint = getValueBoxTextMessageHint(qHi);
      if (messageHint) {
        rows.push(`<dt>Known text selector</dt><dd>${escapeHtml(`QHi ${qHi} matches TEXTFILE message ${qHi}: ${messageHint}`)}</dd>`);
      }
      const consumers = collectNearbyLinkedItems(item, VALUEBOX_CONSUMER_SHAPES);
      if (consumers.length) {
        const preview = consumers.slice(0, 3).map(({ item: candidate, distance }) => `${describeLinkedItem(candidate)} (dist ${Math.round(distance)})`);
        rows.push(`<dt>Nearby consumers</dt><dd>${escapeHtml(`${consumers.length} nearby same-QLo monitor/watcher consumer${consumers.length === 1 ? "" : "s"}: ${preview.join("; ")}`)}</dd>`);
      }
      rows.push("<dt>Payload visibility</dt><dd>The authored bytes are viewable here: raw quality, QLo, QHi, mapNum, npcNum, and nextItem. The separate number returned by VALBOX.slot_20 is still not fully decoded, so keypad/passcode-style payloads remain partially opaque.</dd>");
    }

    if (definition.shape === BOX_EW_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>BOX_EW</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Switch bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (item?.frame === 0) {
        rows.push("<dt>Trigger lane</dt><dd>Frame 0 is the active switch lane: while map-array is clear it plays the switch SFX and dispatches TRIGGER lane 1.</dd>");
        if (qLo !== null) {
          rows.push(`<dt>Helper overlay</dt><dd>${escapeHtml(`Current renderer arrows only expose nearby same-QLo 0x04B1 helpers for frame 0, using local link id ${qLo}.`)}</dd>`);
        }
      } else {
        rows.push("<dt>Trigger lane</dt><dd>Nonzero frames still dispatch through TRIGGER, but the recovered body uses lane 0 and sampled scenes did not justify the same generic cmd-link overlay rule.</dd>");
      }
    }

    if (definition.shape === PANELEW_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>PANELEW</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Switch bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (item?.frame === 0) {
        rows.push("<dt>Activation</dt><dd>Frame 0 is the idle panel state in the recovered usecode body. PANELEW.use returns immediately until the panel is in a nonzero frame.</dd>");
      } else {
        rows.push("<dt>Trigger lane</dt><dd>Nonzero frames use the live switch lane: while the map byte stays clear, PANELEW.use dispatches TRIGGER lane 0 from the panel itself.</dd>");
      }
      if (qLo !== null) {
        rows.push(`<dt>Helper overlay</dt><dd>${escapeHtml(`Current renderer arrows expose nearby same-QLo 0x04B1 helpers using local link id ${qLo}.`)}</dd>`);
      }
    }

    if (definition.shape === FASTSKIL_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>FASTSKIL</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Quality bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Activation</dt><dd>enterFastArea waits 5 ticks, then only runs the skill/trigger body while map-array is clear.</dd>");
      if (item?.frame === 0) {
        rows.push("<dt>Difficulty gate</dt><dd>Frame 0 uses TRIGGER lane 0 below difficulty 2 and lane 1 at difficulty 2 and above, then clears QLo on return.</dd>");
      } else if (item?.frame === 1) {
        rows.push("<dt>Difficulty gate</dt><dd>Frame 1 uses TRIGGER lane 0 below difficulty 3 and lane 1 at difficulty 3 and above, then clears QLo on return.</dd>");
      } else if (item?.frame === 2) {
        rows.push("<dt>Skill lane</dt><dd>Frame 2 preserves the base QLo and dispatches diff1 -&gt; QLo, diff2 -&gt; QLo + 1, diff3+ -&gt; QLo + 2 before restoring the original QLo.</dd>");
        if (qLo !== null) {
          rows.push(`<dt>Derived cmd lanes</dt><dd>${escapeHtml(`diff1 -> QLo ${qLo}, diff2 -> QLo ${(qLo + 1) & 0xff}, diff3+ -> QLo ${(qLo + 2) & 0xff}`)}</dd>`);
        }
      }
    }

    if (definition.shape === SKILLBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>SKILLBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Quality bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (item?.frame === 0) {
        rows.push("<dt>Difficulty gate</dt><dd>Frame 0 flips at difficulty 2: below threshold uses trigger lane 1, threshold and above uses lane 0.</dd>");
      } else if (item?.frame === 1) {
        rows.push("<dt>Difficulty gate</dt><dd>Frame 1 flips at difficulty 3: lower difficulties use trigger lane 1, difficulty 3 and above uses lane 0.</dd>");
      } else if (item?.frame === 2) {
        rows.push("<dt>Skill lane</dt><dd>Frame 2 uses QLo as a base skill/link id and dispatches diff1 -> QLo, diff2 -> QLo + 1, diff3+ -> QLo + 2 before restoring the original QLo.</dd>");
      }
    }

    if (definition.shape === CMD_LINK_SHAPE) {
      const cmdMetadata = getCmdLinkCandidateSummary(item);
      rows.push("<dt>Decoded role</dt><dd>Trigger/link controller (`cmd` helper), not a DTABLE NPC spawner.</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (rawMapNum !== null) {
        rows.push(`<dt>Map flags</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)})`)}</dd>`);
      }
      if (cmdMetadata) {
        rows.push(`<dt>Field map</dt><dd>${escapeHtml(`QLo is the local link id. QHi low bits select subcommand ${cmdMetadata.subcommand}, QHi high bits carry arg ${cmdMetadata.subcommandArg}. mapNum low bits decode mode/itemMode/phase/priority, while mapNum high bits plus npcNum build target code ${formatWordHex(cmdMetadata.targetCode)}.`)}</dd>`);
        rows.push(`<dt>Phase lane</dt><dd>${escapeHtml(`Responds to TRIGGER phase ${cmdMetadata.phaseLane}${cmdMetadata.phaseLane === 0 ? " / 0x80" : " / 0x81"} because map bit 0x08 is ${cmdMetadata.phaseLane === 0 ? "set" : "clear"}.`)}</dd>`);
        rows.push(`<dt>Dispatch mode</dt><dd>${escapeHtml(`${cmdMetadata.itemMode ? "Item-targeting" : "NPC-triggering"} path, mode ${cmdMetadata.mode}, ${cmdMetadata.lowPriority ? "deferred/low-priority" : "immediate"} execution.`)}</dd>`);
        rows.push(`<dt>Target decode</dt><dd>${escapeHtml(`${cmdMetadata.targetLabel} from npcNum ${cmdMetadata.npcByte} + map high bits ${formatByteHex(cmdMetadata.mapByte & 0xe0)}.`)}</dd>`);
        rows.push(`<dt>Operation</dt><dd>${escapeHtml(`${cmdMetadata.subcommandLabel}. ${cmdMetadata.subcommandNote}`)}</dd>`);
        if (cmdMetadata.targetKind === "exact-shape") {
          rows.push(`<dt>Nearby target matches</dt><dd>${escapeHtml(`${cmdMetadata.matchingLink.length} nearby exact-shape target${cmdMetadata.matchingLink.length === 1 ? "" : "s"} share this link id out of ${cmdMetadata.matchingShape.length} nearby shape match${cmdMetadata.matchingShape.length === 1 ? "" : "es"}.`)}</dd>`);
          if (cmdMetadata.preview.length) {
            rows.push(`<dt>Candidate links</dt><dd>${escapeHtml(cmdMetadata.preview.join("; "))}</dd>`);
          }
        }
      }
    }

    if (definition.shape === TIMER_SHAPE) {
      const timer = getTimerMetadata(item);
      rows.push("<dt>Decoded class</dt><dd>TIMER</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Timer bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (timer) {
        rows.push(`<dt>Delay payload</dt><dd>${escapeHtml(`mapNum:npcNum packs ${timer.packedDelay} ticks (${formatWordHex(timer.packedDelay)}). qHi tier ${timer.trimTier} trims that by ${timer.trimPercent}%, leaving an effective ${timer.trimmedDelay}-tick wait.`)}</dd>`);
        rows.push(`<dt>Flag bits</dt><dd>${escapeHtml(`qHi bit 0 = ${timer.repeatWhileArmed ? "repeat while armed" : "one-shot clear"}, bit 1 = ${timer.armOnEnterFastArea ? "arm on enter" : "skip enter arm"}, bit 2 = ${timer.armOnLeaveFastArea ? "arm on leave" : "skip leave arm"}, bit 3 = ${timer.phaseRoutingBit ? "alternate in/out phase routing" : "default in/out phase routing"}, bit 4 = ${timer.suppressPhaseOneBit ? "suppress one late phase branch" : "allow both late phase branches"}.`)}</dd>`);
      }
      rows.push("<dt>Timer note</dt><dd>Recovered TIMER.enterFastArea / leaveFastArea only arm the worker; TIMER.slot_20 performs the actual wait loop, checks fast-area state and status bit 0x1000, and then fans out into TRIGGER slot 0x20 with phase 0x80 or 0x81.</dd>");
    }

    if (definition.shape === SPECIAL_SHAPE) {
      const special = getSpecialMetadata(item);
      rows.push("<dt>Decoded class</dt><dd>SPECIAL</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Special bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (special) {
        rows.push(`<dt>Field roles</dt><dd>${escapeHtml(`mapNum ${special.rawMapNum} and npcNum ${special.rawNpcNum} are phase/control bytes, not DTABLE rows. qHi ${special.qHi} is the delay byte used by SPECIAL.slot_21, and QLo ${special.qLo} is the local link byte that slot 0x21 can bump by +3 before restoring it.`)}</dd>`);
        rows.push(`<dt>Fast-area gates</dt><dd>${escapeHtml(`enterFastArea reacts directly to mapNum==1 (${special.immediateEnterPhase ? "armed here" : "not set"}) or npcNum==1 (${special.immediateNpcEnterPhase ? "armed here" : "not set"}); leaveFastArea uses the analogous value 2 checks.`)}</dd>`);
      }
      rows.push("<dt>Special note</dt><dd>Recovered SPECIAL.enterFastArea / leaveFastArea feed TRIGGER.slot_20 with phases 0x80 and 0x81, while SPECIAL.slot_21 handles the looping or counter-based cases and can temporarily rewrite QLo before restoring it.</dd>");
    }

    if (definition.shape === EVENT_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>EVENT</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Event bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Event note</dt><dd>Recovered EVENT.equip reads QLo as a link id and uses different event lanes to drive triggers, camera/audio, door logic, and nearby helper objects.</dd>");
    }

    if (definition.shape === GENERATR_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>GENERATR</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Generator bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Destroy lane</dt><dd>Recovered GENERATR.gotHit is a very small wrapper: it excludes the source generator item and immediately dispatches TRIGGER lane 0 from that same item.</dd>");
      if (qLo !== null) {
        rows.push(`<dt>Helper overlay</dt><dd>${escapeHtml(`Current renderer arrows expose nearby same-QLo 0x04B1 helpers using local link id ${qLo}.`)}</dd>`);
      }
      rows.push("<dt>Set-piece note</dt><dd>Remorse SATARG.use also scans nearby 0x03C1 generators during its countdown/shutdown sequence, so some authored placements participate in local scripted power-down scenes beyond the plain gotHit trigger lane.</dd>");
    }

    if (definition.shape === CRUMORPH_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>CRUMORPH</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Pad bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Actor-key note</dt><dd>Recovered CRUMORPH.equip does not match on DTABLE row or exported npcNum. It compares the pad QLo against mutable actor field 0x63 on nearby NPCs before transferring control and bracketing TRIGGER lane 0 or 1.</dd>");
      rows.push("<dt>Overlay stance</dt><dd>The renderer currently exposes only the cautious nearby same-QLo 0x04B1 helper arrows. Actor-target arrows stay disabled because static scene/cache export does not expose the actor-side field-0x63 state.</dd>");
    }

    if (definition.shape === NPC_ONLY_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>NPC_ONLY</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Pad bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Actor-key note</dt><dd>Recovered NPC_ONLY.gotHit compares the pad QLo against mutable actor field 0x63 on the incoming NPC-like source, then brackets TRIGGER lane 0 and lane 1 while the match remains valid.</dd>");
      rows.push("<dt>Overlay stance</dt><dd>The renderer currently exposes only cautious nearby same-QLo 0x04B1 helper arrows. Actor-target arrows stay disabled because neither DTABLE metadata nor static scene/cache export proves the actor-side field-0x63 value.</dd>");
    }

    if (definition.shape === NPCTRIG_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>NPCTRIG</dd>");
      rows.push("<dt>Trigger note</dt><dd>Disasm crosswalks shape 0x0363 to NPCTRIG, whose compact slot-0x0A body remains one of the strongest active-event frontiers in the current corpus.</dd>");
    }

    if (definition.shape === CRUZTRIG_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>CRUZTRIG</dd>");
      rows.push("<dt>Trigger note</dt><dd>Disasm crosswalks shape 0x0365 to CRUZTRIG, and the recovered live body is gotHit rather than a generic placeholder slot.</dd>");
    }

    if (definition.shape === VMAIL_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>VMAIL</dd>");
      rows.push("<dt>Mail note</dt><dd>Disasm crosswalks shape 0x0367 to VMAIL; slot 0x0A is the active helper body even though the exact event name remains weaker than the slot number.</dd>");
    }

    if (definition.shape === MONITNS_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>MONITNS</dd>");
      rows.push("<dt>Monitor note</dt><dd>Existing gameplay notes identify shape 0x0102 as a live monitor/computer object whose MONITNS.use body is a defensible first inspection point.</dd>");
      if (item?.frame <= 1) {
        rows.push("<dt>Current state</dt><dd>Recovered MONITNS.use only scans nearby VALUEBOX records once the monitor is above frame 1, so this frame reads as a dormant or inactive authored state.</dd>");
      }
      appendLinkedValueBoxRows(rows, item, "MONITNS");
    }

    if (definition.shape === MONITEW_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>MONITEW</dd>");
      rows.push("<dt>Monitor note</dt><dd>Disasm crosswalks shape 0x0165 to the MONITEW east-west monitor variant, which also has a live use handler.</dd>");
      if (item?.frame <= 1) {
        rows.push("<dt>Current state</dt><dd>Recovered MONITEW.use only scans nearby VALUEBOX records once the monitor is above frame 1, so this frame reads as a dormant or inactive authored state.</dd>");
      }
      appendLinkedValueBoxRows(rows, item, "MONITEW");
    }

    if (definition.shape === MONSTER_SPAWNER_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>MONSTER</dd>");
      rows.push(`<dt>Spawner note</dt><dd>${escapeHtml(getMonsterSpawnerActivationSummary(item))}</dd>`);
      rows.push("<dt>Viewer stance</dt><dd>Frame-0 0x04D0 objects now link directly to MONSTER.enterFastArea because that is the verified automatic enter-area lane.</dd>");
    }

    if (definition.shape === NUMBERS_SHAPE) {
      rows.push("<dt>Decoded family</dt><dd>NUMBERS</dd>");
      rows.push("<dt>Display note</dt><dd>Tiny glyph-like frames in exported scenes cluster beside larger 0x0501/0x0502/0x0503/0x0505/0x0507 readout pieces instead of local trigger controllers.</dd>");
      rows.push("<dt>Overlay stance</dt><dd>Shown as a labeled display helper only; current scene evidence does not support helper arrows from this family.</dd>");
    }

    if (definition.shape === TRIGPAD_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>TRIGPAD</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Pad bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Activation</dt><dd>gotHit is occupancy and surface gated, waits briefly after the pad is armed, then dispatches TRIGGER lane 0 and later lane 1 as the actor leaves or the condition clears.</dd>");
      rows.push("<dt>Extra behavior</dt><dd>The same body also scans nearby elevator-family helpers and can call ELEVAT control slots, so this is broader than a simple one-shot cmd-link source.</dd>");
      rows.push("<dt>Overlay stance</dt><dd>Named and decoded in tooltips, but broader scene sweeps did not justify a generic TRIGPAD -&gt; 0x04B1 helper arrow rule.</dd>");
    }

    if (definition.shape === FLAMEBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>FLAMEBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Flame link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Flame note</dt><dd>Recovered FLAMEBOX.equip uses shared QLo to scan nearby flame-family helpers and can replace helper markers with active flame actors.</dd>");
    }

    if (definition.shape === CHEST_NS_SHAPE || definition.shape === CHEST_EW_SHAPE) {
      rows.push(`<dt>Decoded class</dt><dd>${escapeHtml(definition.shape === CHEST_NS_SHAPE ? "CHEST_NS" : "CHEST_EW")}</dd>`);
      rows.push("<dt>Chest note</dt><dd>Use opens the chest, runs the local animation/audio sequence, and can spawn contents through the FREE object-creation path.</dd>");
    }

    if (definition.shape === DOOR_DEATH_HELPER_SHAPE) {
      rows.push("<dt>Decoded role</dt><dd>Destroyable-door trigger helper.</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Door link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (rawMapNum !== null) {
        rows.push(`<dt>Lane select</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)}): clear routes to trigger lane 0, nonzero routes to lane 0x80.`)}</dd>`);
      }
      rows.push("<dt>Door note</dt><dd>Current read: this helper exists so authored doors can become destroyable and then forward into the normal or +0x80 trigger lane.</dd>");
    }

    if (definition.shape === STEAMBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>STEAMBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Steam link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Steam note</dt><dd>Recovered STEAMBOX.equip matches nearby steam-family helpers by QLo and forwards them into event 0/1 control lanes.</dd>");
    }

    if (definition.shape === WATCHNS_SHAPE || definition.shape === WATCHEW_SHAPE) {
      rows.push(`<dt>Decoded class</dt><dd>${escapeHtml(definition.shape === WATCHNS_SHAPE ? "WATCHNS" : "WATCHEW")}</dd>`);
      if (rawQuality !== null) {
        rows.push(`<dt>Watcher bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (rawMapNum !== null) {
        rows.push(`<dt>Map byte</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)}): zero takes the nearby 0x0510 secret-door-post lane; nonzero falls through the alternate text/value path before slot 0x21.`)}</dd>`);
      }
      rows.push("<dt>Watcher note</dt><dd>Recovered slot 0x20 scans nearby 0x0510 posts, uses qHi-0 matches as the local text/door marker lane, then brackets TRIGGER.slot_20 around the watcher slot 0x21 phase.</dd>");
      rows.push("<dt>Actor-key note</dt><dd>The later watcher lane also checks nearby actor field 0x63 against the controller QLo. That makes WATCHNS/WATCHEW part of the same hidden actor-key family as CRUMORPH and NPC_ONLY, but the current viewer keeps that actor side metadata-only.</dd>");
    }

    if (definition.shape === SECRET_DOOR_POST_SHAPE) {
      rows.push("<dt>Decoded role</dt><dd>Secret-door post/helper target for WATCHNS/WATCHEW.</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Post bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Watcher note</dt><dd>Current best read: nearby WATCHNS/WATCHEW controllers use the low quality byte as the local match key, and qHi-0 posts are the text/door-side marker lane in the recovered watcher body.</dd>");
    }

    if (definition.shape === CRAZYEW_SHAPE || definition.shape === CRAZYNS_SHAPE) {
      rows.push(`<dt>Decoded class</dt><dd>${escapeHtml(definition.shape === CRAZYEW_SHAPE ? "CRAZYEW" : "CRAZYNS")}</dd>`);
      rows.push("<dt>Wake-up note</dt><dd>Recovered gotHit only reacts to actor handles >= 0x00FF, checks NPC.slot_2A, and then spawns NPC.slot_2C unless the target is already in activity 12.</dd>");
    }

    if (definition.shape === VIDEOBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>VIDEOBOX</dd>");
      rows.push("<dt>Video note</dt><dd>Recovered VIDEOBOX.equip is mostly a gate: when global 0x0001 is clear it falls straight into ITEM.slot_21, otherwise it runs a short helper loop before returning.</dd>");
    }

    if (definition.shape === SFXTRIG_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>SFXTRIG</dd>");
      rows.push("<dt>SFX note</dt><dd>Disasm crosswalks shape 0x04E2 to SFXTRIG, a compact event-bearing helper whose active exported body lives at slot 0x0A.</dd>");
    }

    if (definition.shape === DEATHBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>DEATHBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Death link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Death note</dt><dd>Disasm crosswalks shape 0x04E7 to DEATHBOX, whose slot 0x0A helper body matches death-link QLo and forwards NPC death events into TRIGGER lanes.</dd>");
    }

    if (definition.shape === BRO_BOOT_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>BRO_BOOT</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Boot link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Boot note</dt><dd>Recovered BRO_BOOT.enterFastArea scans nearby SPANEL items by shared QLo, applies ITEM control slots, and then runs its own boot animation loop.</dd>");
    }

    if (definition.shape === ALARMHAT_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>ALARMHAT</dd>");
      if (item?.frame === 0) {
        rows.push("<dt>Alarm lane</dt><dd>Frame 0 is the direct local alarm scan: it walks nearby 0x04D0 helpers and targets their frame-0 state.</dd>");
      } else {
        rows.push("<dt>Alarm lane</dt><dd>Nonzero frames add on-screen and nearby-actor gating before the same local 0x04D0 helper scan runs.</dd>");
      }
    }

    if (definition.shape === ALRMTRIG_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>ALRMTRIG</dd>");
      if (rawMapNum !== null) {
        rows.push(`<dt>Alert lane byte</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)}): zero selects base lanes 0/1, nonzero selects 0x80/0x81.`)}</dd>`);
      }
      rows.push("<dt>Alert note</dt><dd>Recovered ALRMTRIG.equip only checks map-array state and World.getAlertActive() before dispatching one of four TRIGGER lanes.</dd>");
    }

    if (definition.shape === PRESSURE_BARRIER_V_SHAPE || definition.shape === PRESSURE_BARRIER_H_SHAPE) {
      rows.push(`<dt>Decoded role</dt><dd>${escapeHtml(definition.shape === PRESSURE_BARRIER_V_SHAPE ? "Pressure barrier (vertical face)" : "Pressure barrier (horizontal face)")}</dd>`);
      if (rawQuality !== null) {
        rows.push(`<dt>Barrier bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Barrier note</dt><dd>Recovered CRYOBOX.equip and its worker slots use shared QLo to find these nearby faces, animate them, and trigger the steam-release helper lane.</dd>");
    }

    if (definition.shape === CRYOBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>CRYOBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Cryobox bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (item?.frame === 0) {
        rows.push("<dt>Switch lane</dt><dd>Frame 0 scans nearby 0x05D9/0x05DA helper states by shared QLo and spawns slot 0x21 to transition them toward the matching pressure-barrier face.</dd>");
      } else {
        rows.push("<dt>Barrier lane</dt><dd>Nonzero frames scan nearby 0x05DF/0x05E0 pressure-barrier faces by shared QLo and spawn slot 0x20 to drive the open/steam animation path.</dd>");
      }
      rows.push("<dt>Cryobox note</dt><dd>Recovered CRYOBOX slot 0x20/0x21 wait on animation frames and screen visibility, then switch ITEM control slots and spawn STEAM worker lanes for the matched barrier face.</dd>");
    }

    if (definition.shape === USECODE_TRIGGER_EGG_SHAPE && item.egg?.type === "usecode-trigger") {
      const range = getUsecodeTriggerEggRange(item);
      const subtype = getUsecodeTriggerEggSubtypeInfo(item, state.current?.selected?.game ?? null);
      rows.push("<dt>Decoded role</dt><dd>Usecode-trigger proximity egg.</dd>");
      rows.push("<dt>Egg note</dt><dd>Family-4 shape 0x0011 is a hidden usecode trigger egg. The runtime selects the authored class from QLo via class id 0x0900 + QLo, not from mapNum.</dd>");
      if (range) {
        rows.push(`<dt>Trigger range</dt><dd>${escapeHtml(`npc ${range.rawNpcNum} (${formatByteHex(range.rawNpcNum)}): X ${range.xRange} * 64 = ${range.worldXRange}, Y ${range.yRange} * 64 = ${range.worldYRange}, Z window +/- ${range.zWindow}.`)}</dd>`);
        rows.push("<dt>Overlay stance</dt><dd>Pinned or hovered items now draw the projected trigger footprint instead of only the 1x1 egg bounding box.</dd>");
      }
      if (rawMapNum !== null) {
        rows.push(`<dt>Egg ID</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)})`)}</dd>`);
      }
      if (rawQuality !== null) {
        rows.push(`<dt>Egg bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (subtype) {
        rows.push(`<dt>Subtype selector</dt><dd>${escapeHtml(`QLo ${subtype.qLo} resolves to family-4 class ${formatWordHex(subtype.classId)}${subtype.className ? ` (${subtype.className})` : ""}.`)}</dd>`);
        if (subtype.className && Number.isInteger(subtype.slot)) {
          const eventLabel = subtype.eventNameHint || `slot_${subtype.slot.toString(16).padStart(2, "0")}`;
          rows.push(`<dt>Viewer target</dt><dd>${escapeHtml(`${subtype.className}.${eventLabel} is the stable first-view script body for this authored subtype.`)}</dd>`);
        }
        if (subtype.activeLaneLabel) {
          rows.push(`<dt>Active lane</dt><dd>${escapeHtml(subtype.activeLaneLabel)}</dd>`);
        }
        rows.push(`<dt>Subtype note</dt><dd>${escapeHtml(subtype.note)}</dd>`);
        rows.push(`<dt>Arrow stance</dt><dd>${escapeHtml(subtype.overlayNote)}</dd>`);
      }
    }

    return rows.join("");
  }

  function shouldShowRawLinkage(item, definition) {
    if (item.egg) {
      return true;
    }
    if (definition?.kind === "editor" || definition?.kind === "helper") {
      return true;
    }
    return [item.mapNum, item.npcNum, item.quality, item.nextItem].some((value) => Number.isInteger(value) && value !== 0);
  }

  function renderObjectMetadataRows(item, definition = null) {
    if (!definition) {
      return "";
    }

    const rows = [];
    const dimensions = formatDefinitionDimensions(definition);
    if (dimensions) {
      rows.push(`<dt>Dimensions</dt><dd>${escapeHtml(dimensions)}</dd>`);
    }

    if (definition.visibilityTags?.length) {
      rows.push(`<dt>Tags</dt><dd>${escapeHtml(definition.visibilityTags.join(", "))}</dd>`);
    }

    const traits = getDefinitionTraitLabels(definition);
    if (traits.length) {
      rows.push(`<dt>Traits</dt><dd>${escapeHtml(traits.join(", "))}</dd>`);
    }

    const roleHint = getDefinitionRoleHint(item, definition);
    if (roleHint) {
      rows.push(`<dt>Role hint</dt><dd>${escapeHtml(roleHint)}</dd>`);
    }

    const usecodeTarget = getUsecodeViewTarget(item, definition);
    if (usecodeTarget) {
      rows.push(`<dt>USECODE</dt><dd>${escapeHtml(`${usecodeTarget.label}: ${usecodeTarget.note}`)}</dd>`);
    }

    const specialRows = renderSpecialEditorRows(item, definition);
    if (specialRows) {
      rows.push(specialRows);
    }

    if (shouldShowRawLinkage(item, definition)) {
      const linkageParts = [
        `map=${formatNumericField(item.mapNum)}`,
        `npc=${formatNumericField(item.npcNum)}`,
        `quality=${formatNumericField(item.quality)}`,
        `next=${formatNumericField(item.nextItem)}`
      ];
      rows.push(`<dt>Raw linkage</dt><dd>${escapeHtml(linkageParts.join(", "))}</dd>`);
    }

    return rows.length ? `${rows.join("")}` : "";
  }

  function buildWarpCommand(item) {
    const mapId = state.current?.selected?.mapId;
    if (!Number.isInteger(mapId)) {
      return "";
    }
    if (item.egg?.type === "teleport-destination" && Number.isInteger(item.egg?.labelId)) {
      return `-warp 0 -mapoff ${mapId} -egg ${item.egg.labelId}`;
    }
    const diskX = Math.trunc(item.world.x / 2);
    const diskY = Math.trunc(item.world.y / 2);
    return `-warp 0 ${diskX} ${diskY} ${item.world.z} -mapoff ${mapId}`;
  }

  return {
    buildWarpCommand,
    getMonsterSpawnerItems,
    getMonsterSpawnerLikelySpawnOwner,
    getMonsterSpawnerPairCandidates,
    getMonsterSpawnerSignalKey,
    getNpcSpawnerInfoForItem,
    isMonsterSpawnerAutoEnterEnabled,
    isMonsterSpawnerItem,
    renderChestSpawnerMetadataRows,
    renderMonsterSpawnerActivationRows,
    renderMonsterSpawnerEditor,
    renderNpcMetadataRows,
    renderObjectMetadataRows,
    getUsecodeViewTarget
  };
}
