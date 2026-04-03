import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CACHE_ROOT, CATALOG_ROOT } from "../config.js";
import { GENERATED_INTRINSIC_HINT_TABLES } from "./usecode-intrinsic-hints.generated.js";

const USECODE_CACHE_ROOT = path.join(CACHE_ROOT, "usecode");
const USECODE_CACHE_SCHEMA_VERSION = 4;
const DISASM_OPCODE_TABLE_PATH = path.resolve(CACHE_ROOT, "..", "..", "..", "crusader-disasm", "usecode_opcodes.txt");
const USECODE_DECOMPILER_IMPL_PATH = fileURLToPath(import.meta.url);
const USECODE_SHAPE_CATALOG_PATHS = [
  path.join(CATALOG_ROOT, "usecode_shape_catalog_remorse.csv"),
  path.join(CATALOG_ROOT, "usecode_shape_catalog_regret.csv")
];

const EVENT_NAME_HINTS = {
  0x00: "look",
  0x01: "use",
  0x02: "anim",
  0x03: "setActivity",
  0x04: "cachein",
  0x05: "hit",
  0x06: "gotHit",
  0x07: "hatch",
  0x08: "schedule",
  0x09: "release",
  0x0a: "equip",
  0x0b: "unequip",
  0x0c: "combine",
  0x0d: "func0D",
  0x0e: "calledFromAnim",
  0x0f: "enterFastArea",
  0x10: "leaveFastArea",
  0x11: "cast",
  0x12: "justMoved",
  0x13: "avatarStoleSomething",
  0x14: "animGetHit",
  0x15: "unhatch",
  0x16: "func16",
  0x17: "func17",
  0x18: "func18",
  0x19: "func19",
  0x1a: "func1A",
  0x1b: "func1B",
  0x1c: "func1C",
  0x1d: "func1D",
  0x1e: "func1E",
  0x1f: "func1F"
};

const VARIANT_INTRINSIC_CALLSITE_HINTS = {
  regret: {
    "30:16": "Item::I_fireWeapon(Item *, x, y, z, byte, int, byte)"
  },
  remorse: {}
};

const CLASS_EVENT_NAME_HINTS = {
  "2572:50": "waitNTimerTicks"
};

const LOOP_SELECTOR_FIELD_HINTS = {
  0x3a: "family",
  0x40: "shape"
};

const NO_ARG_MNEMONICS = {
  0x08: "pop_result",
  0x12: "pop_temp",
  0x13: "pop_temp_dword",
  0x14: "add",
  0x15: "add_dword",
  0x16: "concat",
  0x17: "append_list",
  0x1c: "sub",
  0x1d: "sub_dword",
  0x1e: "mul",
  0x1f: "mul_dword",
  0x20: "div",
  0x21: "div_dword",
  0x22: "mod",
  0x23: "mod_dword",
  0x24: "cmp",
  0x25: "cmp_dword",
  0x26: "strcmp",
  0x27: "cmp_huge",
  0x28: "lt",
  0x29: "lt_dword",
  0x2a: "le",
  0x2b: "le_dword",
  0x2c: "gt",
  0x2d: "gt_dword",
  0x2e: "ge",
  0x2f: "ge_dword",
  0x30: "not",
  0x31: "not_dword",
  0x32: "and",
  0x33: "and_dword",
  0x34: "or",
  0x35: "or_dword",
  0x36: "ne",
  0x37: "ne_dword",
  0x39: "bit_and",
  0x3a: "bit_or",
  0x3b: "bit_not",
  0x3c: "lsh",
  0x3d: "rsh",
  0x50: "ret",
  0x53: "suspend",
  0x59: "push_pid",
  0x5d: "push_retval_byte",
  0x5e: "push_retval_word",
  0x5f: "push_retval_dword",
  0x60: "word_to_dword",
  0x61: "dword_to_word",
  0x68: "copy_string",
  0x6a: "ptr_to_string",
  0x6b: "str_to_ptr",
  0x6d: "push_process_result",
  0x73: "loopnext",
  0x77: "set_info",
  0x78: "process_exclude",
  0x7a: "end"
};

const INTRINSIC_HINT_TABLES = GENERATED_INTRINSIC_HINT_TABLES;

const SHAPE_REFERENCE_PATTERNS = [
  /(?<prefix>\bshape=)(?<value>(?:0x[0-9A-Fa-f]+|\d+))\b/gu,
  /(?<prefix>\bItem\.(?:getShape|getType)\([^\)\n]*\)\s*(?:==|!=|<=|>=|<|>)\s*)(?<value>(?:0x[0-9A-Fa-f]+|\d+))\b/gu,
  /(?<prefix>\bItem\.create\(\s*[^,\n]+,\s*)(?<value>(?:0x[0-9A-Fa-f]+|\d+))\b/gu,
  /(?<prefix>\bItem\.legal_create\(\s*)(?<value>(?:0x[0-9A-Fa-f]+|\d+))\b/gu
];

function loadOfficialOpcodeNames() {
  const names = new Map();
  if (!fs.existsSync(DISASM_OPCODE_TABLE_PATH)) return names;
  const lines = fs.readFileSync(DISASM_OPCODE_TABLE_PATH, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const match = /^\s*0x([0-9A-Fa-f]{2})\s+([A-Z0-9_]+)\s*$/u.exec(line);
    if (!match) continue;
    names.set(Number.parseInt(match[1], 16), match[2]);
  }
  return names;
}

const OFFICIAL_OPCODE_NAMES = loadOfficialOpcodeNames();

function sha1(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

function readU32LE(buf, off) {
  return buf.readUInt32LE(off);
}

function readU16LE(buf, off) {
  return buf.readUInt16LE(off);
}

function signedByte(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bpRepr(value) {
  const disp = signedByte(value);
  return `[BP${disp >= 0 ? "+" : "-"}${String(Math.abs(disp)).padStart(2, "0")}h]`;
}

function spRepr(value) {
  const disp = signedByte(value);
  return `[SP${disp >= 0 ? "+" : "-"}${String(Math.abs(disp)).padStart(2, "0")}h]`;
}

function sanitizeIdentifier(name) {
  const cleaned = String(name ?? "")
    .trim()
    .split("")
    .map((char) => (/[A-Za-z0-9_]/u.test(char) ? char : "_"))
    .join("")
    .replace(/^_+|_+$/gu, "");
  if (!cleaned) return "var";
  return /^\d/u.test(cleaned) ? `v_${cleaned}` : cleaned;
}

function formatScriptString(value) {
  return `"${String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function formatGlobalReference(globalId) {
  return `global[0x${globalId.toString(16).padStart(4, "0")}]`;
}

function parseNumeric(value) {
  return Number.parseInt(String(value), 0);
}

function getIntrinsicNameHint(variant, ordinal, argBytes) {
  return VARIANT_INTRINSIC_CALLSITE_HINTS[variant]?.[`${ordinal}:${argBytes}`]
    ?? INTRINSIC_HINT_TABLES[variant]?.get(ordinal)
    ?? INTRINSIC_HINT_TABLES.base.get(ordinal)
    ?? null;
}

function getShapeCatalogPath(gameId) {
  const baseGame = String(gameId).startsWith("regret") ? "regret" : "remorse";
  return path.join(CATALOG_ROOT, baseGame === "regret" ? "usecode_shape_catalog_regret.csv" : "usecode_shape_catalog_remorse.csv");
}

function loadShapeCatalog(gameId) {
  const catalogPath = getShapeCatalogPath(gameId);
  if (!fs.existsSync(catalogPath)) return new Map();
  const lines = fs.readFileSync(catalogPath, "utf8").split(/\r?\n/u).filter(Boolean);
  if (lines.length < 2) return new Map();
  const headers = parseCsvLine(lines[0]);
  const map = new Map();
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const shapeCode = parseShapeCode(row.shape_code);
    if (shapeCode == null) continue;
    map.set(shapeCode, String(row.human_readable_id || "").trim());
  }
  return map;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseShapeCode(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return Number.parseInt(text, text.toLowerCase().startsWith("0x") ? 16 : 10);
}

function applyShapeCatalogToPseudocode(text, shapeCatalog) {
  if (!shapeCatalog || shapeCatalog.size === 0) return text;
  let rendered = text;
  for (const pattern of SHAPE_REFERENCE_PATTERNS) {
    rendered = rendered.replace(pattern, (...args) => {
      const groups = args.at(-1);
      const numeric = parseNumeric(groups.value);
      const shapeName = shapeCatalog.get(numeric);
      return shapeName ? `${groups.prefix}${sanitizeIdentifier(shapeName)}` : args[0];
    });
  }
  return rendered;
}

class BodyReader {
  constructor(data, offset = 0) {
    this.data = data;
    this.offset = offset;
  }

  readU8() {
    const value = this.data[this.offset];
    this.offset += 1;
    return value;
  }

  readU16() {
    const value = this.data.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readU32() {
    const value = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readCString() {
    const chars = [];
    while (this.offset < this.data.length) {
      const byte = this.readU8();
      if (byte === 0) break;
      chars.push(String.fromCharCode(byte));
    }
    return chars.join("");
  }

  readFixedString(length) {
    const raw = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return raw.toString("latin1").replace(/\0+$/u, "");
  }
}

function parseFlxTable(buffer) {
  if (buffer.length < 0x58) return { entryCount: 0, entries: [] };
  const entryCount = readU32LE(buffer, 0x54);
  const tableOffset = 0x80;
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    const tableEntryOffset = tableOffset + index * 8;
    if (tableEntryOffset + 8 > buffer.length) break;
    entries.push({
      entryIndex: index,
      tableOffset: tableEntryOffset,
      dataOffset: readU32LE(buffer, tableEntryOffset),
      declaredSize: readU32LE(buffer, tableEntryOffset + 4)
    });
  }
  return { entryCount, entries };
}

function objectIndexFromTableOffset(tableOffset) {
  if (tableOffset < 0x80) return null;
  const relative = tableOffset - 0x80;
  return relative % 8 === 0 ? relative / 8 : null;
}

function decodeNameTableEntry(nameTableData, classId) {
  const nameOffset = 4 + 13 * classId;
  if (nameOffset + 13 > nameTableData.length) return null;
  let raw = nameTableData.subarray(nameOffset, nameOffset + 13);
  const zeroIndex = raw.indexOf(0);
  if (zeroIndex >= 0) raw = raw.subarray(0, zeroIndex);
  return raw.length ? raw.toString("latin1").trim() : null;
}

function extractChunks(buffer) {
  const table = parseFlxTable(buffer);
  const entries = table.entries.filter((entry) => entry.dataOffset > 0 && entry.dataOffset < buffer.length);
  entries.sort((left, right) => left.dataOffset - right.dataOffset);
  return entries.map((entry, index) => {
    const nextOffset = entries[index + 1]?.dataOffset ?? buffer.length;
    const extractedSize = entry.declaredSize > 0 ? entry.declaredSize : Math.max(0, nextOffset - entry.dataOffset);
    const raw = buffer.subarray(entry.dataOffset, Math.min(buffer.length, entry.dataOffset + extractedSize));
    return {
      entryIndex: entry.entryIndex,
      tableOffset: entry.tableOffset,
      objectIndex: objectIndexFromTableOffset(entry.tableOffset),
      dataOffset: entry.dataOffset,
      declaredSize: entry.declaredSize,
      raw
    };
  });
}

function buildClassRows(buffer) {
  const chunks = extractChunks(buffer);
  const nameTableChunk = chunks.find((chunk) => chunk.objectIndex === 1);
  const nameTableData = nameTableChunk?.raw ?? Buffer.alloc(0);
  return chunks
    .filter((chunk) => chunk.objectIndex != null && chunk.objectIndex >= 2)
    .map((chunk) => {
      const classId = chunk.objectIndex - 2;
      const className = decodeNameTableEntry(nameTableData, classId) ?? `class_${classId.toString(16).padStart(4, "0")}`;
      const rawCodeBaseU32 = chunk.raw.length >= 12 ? readU32LE(chunk.raw, 8) : 0;
      const codeBaseMinusOne = rawCodeBaseU32 > 0 ? rawCodeBaseU32 - 1 : null;
      const eventRegion = rawCodeBaseU32 - 20;
      const validEventTable = eventRegion >= 0 && eventRegion % 6 === 0 && 20 + eventRegion <= chunk.raw.length;
      const conservativeEventCount = validEventTable ? eventRegion / 6 : 0;
      const eventRows = [];
      for (let slot = 0; slot < conservativeEventCount; slot += 1) {
        const entryOffset = 20 + slot * 6;
        const rawEventEntryWord = readU16LE(chunk.raw, entryOffset);
        const rawCodeOffset = readU32LE(chunk.raw, entryOffset + 2);
        let derivedBodyStart = null;
        let derivedBodyEnd = null;
        let derivedBodyLength = null;
        if (rawCodeOffset !== 0 && codeBaseMinusOne != null) {
          const bodyStart = codeBaseMinusOne + rawCodeOffset;
          const nextOffsets = [];
          for (let cursor = 0; cursor < conservativeEventCount; cursor += 1) {
            const cursorOffset = readU32LE(chunk.raw, 20 + cursor * 6 + 2);
            if (cursorOffset > rawCodeOffset) nextOffsets.push(cursorOffset);
          }
          const bodyEnd = nextOffsets.length ? codeBaseMinusOne + Math.min(...nextOffsets) : chunk.raw.length;
          if (bodyStart >= 0 && bodyEnd >= bodyStart && bodyEnd <= chunk.raw.length) {
            derivedBodyStart = bodyStart;
            derivedBodyEnd = bodyEnd;
            derivedBodyLength = bodyEnd - bodyStart;
          }
        }
        eventRows.push({
          slot,
          eventNameHint: EVENT_NAME_HINTS[slot] ?? null,
          rawEventEntryWord,
          rawCodeOffset,
          derivedBodyStart,
          derivedBodyEnd,
          derivedBodyLength
        });
      }
      return {
        entryIndex: chunk.entryIndex,
        objectIndex: chunk.objectIndex,
        classId,
        className,
        rawCodeBaseU32,
        codeBaseMinusOne,
        conservativeEventCount,
        raw: chunk.raw,
        eventRows
      };
    });
}

function parseOneOp(body, start, variant, targetClassNames) {
  const reader = new BodyReader(body, start);
  const opcode = reader.readU8();
  let operands = {};
  let mnemonic = NO_ARG_MNEMONICS[opcode] ?? null;
  const officialName = OFFICIAL_OPCODE_NAMES.get(opcode) ?? null;

  if (opcode === 0x00 || opcode === 0x01 || opcode === 0x02 || opcode === 0x04 || opcode === 0x05 || opcode === 0x06 || opcode === 0x3e || opcode === 0x3f || opcode === 0x40 || opcode === 0x41 || opcode === 0x43 || opcode === 0x46 || opcode === 0x47 || opcode === 0x48 || opcode === 0x49 || opcode === 0x4b || opcode === 0x62 || opcode === 0x63 || opcode === 0x64 || opcode === 0x69) {
    const bpOffset = reader.readU8();
    operands = { bp_offset: bpOffset, target: bpRepr(bpOffset) };
    mnemonic = {
      0x00: "pop_local_byte",
      0x01: "pop_local_word",
      0x02: "pop_local_dword",
      0x04: "pop_member_byte",
      0x05: "pop_member_word",
      0x06: "pop_member_dword",
      0x3e: "push_local_byte",
      0x3f: "push_local_word",
      0x40: "push_local_dword",
      0x41: "push_local_string",
      0x43: "push_local_slist",
      0x46: "push_member_byte",
      0x47: "push_member_word",
      0x48: "push_member_dword",
      0x49: "push_member_huge",
      0x4b: "push_local_addr",
      0x62: "free_local_string",
      0x63: "free_local_slist",
      0x64: "free_local_list",
      0x69: "push_string_ptr"
    }[opcode];
  } else if (opcode === 0x03 || opcode === 0x07) {
    const bpOffset = reader.readU8();
    const size = reader.readU8();
    operands = { bp_offset: bpOffset, target: bpRepr(bpOffset), size };
    mnemonic = opcode === 0x03 ? "pop_local_blob" : "pop_member_blob";
  } else if (opcode === 0x09) {
    const bpOffset = reader.readU8();
    operands = { bp_offset: bpOffset, target: bpRepr(bpOffset), element_size: reader.readU8(), slist_flag: reader.readU8() };
    mnemonic = "pop_list_element";
  } else if (opcode === 0x0a) {
    const value = reader.readU8();
    operands = { value_u8: value, value_signed: signedByte(value) };
    mnemonic = "push_byte_immediate";
  } else if (opcode === 0x0b) {
    operands = { value_u16: reader.readU16() };
    mnemonic = "push_word_immediate";
  } else if (opcode === 0x0c) {
    operands = { value_u32: reader.readU32() };
    mnemonic = "push_dword_immediate";
  } else if (opcode === 0x0d) {
    const declaredLength = reader.readU16();
    operands = { declared_length: declaredLength, string: reader.readCString() };
    mnemonic = "push_string_immediate";
  } else if (opcode === 0x0e) {
    operands = { element_size: reader.readU8(), count: reader.readU8() };
    mnemonic = "create_list";
  } else if (opcode === 0x0f) {
    const argBytes = reader.readU8();
    const intrinsicOrdinal = reader.readU16();
    operands = {
      intrinsic_ordinal: intrinsicOrdinal,
      arg_bytes: argBytes,
      intrinsic_name_hint: getIntrinsicNameHint(variant, intrinsicOrdinal, argBytes)
    };
    mnemonic = "call_intrinsic";
  } else if (opcode === 0x10) {
    operands = { target_offset: reader.readU16() };
    mnemonic = "call_near";
  } else if (opcode === 0x11) {
    const targetClassId = reader.readU16();
    const targetSlot = reader.readU16();
    operands = {
      target_class_id: targetClassId,
      target_event_slot: targetSlot,
      target_event_name_hint: EVENT_NAME_HINTS[targetSlot] ?? null,
      target_class_name_hint: targetClassNames.get(targetClassId) ?? null
    };
    mnemonic = "call_class_event";
  } else if ([0x18, 0x19, 0x1a, 0x1b].includes(opcode)) {
    operands = { element_size: reader.readU8() };
    mnemonic = {
      0x18: "append_unique_inline",
      0x19: "append_unique_indirect",
      0x1a: "remove_matching_indirect",
      0x1b: "remove_matching_inline"
    }[opcode];
  } else if (opcode === 0x38) {
    operands = { element_size: reader.readU8(), slist_flag: reader.readU8() };
    mnemonic = "in_list";
  } else if (opcode === 0x42) {
    const bpOffset = reader.readU8();
    operands = { bp_offset: bpOffset, target: bpRepr(bpOffset), element_size: reader.readU8() };
    mnemonic = "push_local_list";
  } else if (opcode === 0x44) {
    operands = { element_size: reader.readU8(), slist_flag: reader.readU8() };
    mnemonic = "push_list_element";
  } else if (opcode === 0x45) {
    operands = { value_a: reader.readU8(), value_b: reader.readU8() };
    mnemonic = "push_huge";
  } else if (opcode === 0x4c || opcode === 0x4d) {
    operands = { size: reader.readU8() };
    mnemonic = opcode === 0x4c ? "push_indirect" : "pop_indirect";
  } else if (opcode === 0x4e || opcode === 0x4f) {
    operands = { global_id: reader.readU16(), size: reader.readU8() };
    mnemonic = opcode === 0x4e ? "push_global" : "pop_global";
  } else if (opcode === 0x51 || opcode === 0x52) {
    const relative = reader.readU16();
    const relativeSigned = relative & 0x8000 ? relative - 0x10000 : relative;
    operands = { relative_u16: relative, relative_signed: relativeSigned, target_offset: reader.offset + relativeSigned };
    mnemonic = opcode === 0x51 ? "jne" : "jmp";
  } else if (opcode === 0x54) {
    operands = { arg0: reader.readU8(), arg1: reader.readU8() };
    mnemonic = "implies";
  } else if (opcode === 0x57) {
    const argBytes = reader.readU8();
    const thisSize = reader.readU8();
    const targetClassId = reader.readU16();
    const targetSlot = reader.readU16();
    operands = {
      arg_bytes: argBytes,
      this_size: thisSize,
      target_class_id: targetClassId,
      target_event_slot: targetSlot,
      target_event_name_hint: EVENT_NAME_HINTS[targetSlot] ?? null,
      target_class_name_hint: targetClassNames.get(targetClassId) ?? null
    };
    mnemonic = "spawn";
  } else if (opcode === 0x58) {
    const targetClassId = reader.readU16();
    const targetSlot = reader.readU16();
    operands = {
      target_class_id: targetClassId,
      target_event_slot: targetSlot,
      target_event_name_hint: EVENT_NAME_HINTS[targetSlot] ?? null,
      inline_offset: reader.readU16(),
      this_size: reader.readU8(),
      unknown: reader.readU8(),
      target_class_name_hint: targetClassNames.get(targetClassId) ?? null
    };
    mnemonic = "spawn_inline";
  } else if (opcode === 0x5a) {
    operands = { local_bytes: reader.readU8() };
    mnemonic = "init";
  } else if (opcode === 0x5b) {
    operands = { line_number: reader.readU16() };
    mnemonic = "line_number";
  } else if (opcode === 0x5c) {
    const relative = reader.readU16();
    const relativeSigned = relative & 0x8000 ? relative - 0x10000 : relative;
    operands = {
      symbol_offset: reader.offset + relativeSigned,
      symbol: reader.readFixedString(8),
      trailing_zero: reader.readU8()
    };
    mnemonic = "symbol_info";
  } else if ([0x65, 0x66, 0x67, 0x6e, 0x6f, 0x74].includes(opcode)) {
    const value = reader.readU8();
    operands = { value_u8: value };
    if ([0x65, 0x66, 0x67].includes(opcode)) operands.target = spRepr(value);
    mnemonic = {
      0x65: "free_stack_string",
      0x66: "free_stack_list",
      0x67: "free_stack_slist",
      0x6e: "add_sp",
      0x6f: "push_stack_addr",
      0x74: "loopscr"
    }[opcode];
  } else if (opcode === 0x6c) {
    const bpOffset = reader.readU8();
    operands = { bp_offset: bpOffset, target: bpRepr(bpOffset), copy_type: reader.readU8() };
    mnemonic = "param_pid_chg";
  } else if (opcode === 0x70) {
    operands = { current_var: reader.readU8(), string_bytes: reader.readU8(), loop_type: reader.readU8() };
    mnemonic = "loop";
  } else if (opcode === 0x75 || opcode === 0x76) {
    const bpOffset = reader.readU8();
    const elementSize = reader.readU8();
    const branch = reader.readU16();
    const branchSigned = branch & 0x8000 ? branch - 0x10000 : branch;
    operands = {
      bp_offset: bpOffset,
      target_var: bpRepr(bpOffset),
      element_size: elementSize,
      relative_u16: branch,
      relative_signed: branchSigned,
      target_offset: reader.offset + branchSigned
    };
    mnemonic = opcode === 0x75 ? "foreach_list" : "foreach_slist";
  } else if (opcode === 0x79) {
    operands = { global_id: reader.readU16() };
    mnemonic = "global_address";
  }

  if (!mnemonic) {
    return {
      op: null,
      nextOffset: start,
      endReason: officialName ? "unsupported_opcode" : "unknown_opcode",
      unknownTail: body.subarray(start),
      unsupportedOpcodeName: officialName,
      unsupportedOpcode: opcode
    };
  }

  const rawBytes = body.subarray(start, reader.offset).toString("hex");
  return {
    op: {
      offset: start,
      absolute_body_offset: start,
      opcode,
      mnemonic,
      official_name: officialName,
      raw_bytes: rawBytes,
      operands
    },
    nextOffset: reader.offset,
    endReason: opcode === 0x7a ? "end_opcode" : null,
    unknownTail: null
  };
}

function parseDebugSymbols(body, start) {
  if (start >= body.length) return null;
  if (body[start] === 0x7a) return { debug_symbols: [], end_offset: start + 1, trailing_bytes: body.subarray(start + 1) };
  const reader = new BodyReader(body, start);
  const count = reader.readU8();
  const debugSymbols = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const unknown1 = reader.readU8();
      const typeId = reader.readU8();
      const bpOffset = reader.readU8();
      const unknown3 = reader.readU8();
      const name = reader.readCString();
      debugSymbols.push({
        index,
        unknown1,
        type_id: typeId,
        type_char: typeId >= 0x20 && typeId <= 0x7e ? String.fromCharCode(typeId) : ".",
        bp_offset: bpOffset,
        bp_repr: bpRepr(bpOffset),
        unknown3,
        name
      });
    }
  } catch {
    return null;
  }
  if (reader.offset >= body.length || body[reader.offset] !== 0x7a) return null;
  return {
    debug_symbols: debugSymbols,
    end_offset: reader.offset + 1,
    trailing_bytes: body.subarray(reader.offset + 1)
  };
}

function buildLocalNameMap(ir) {
  return new Map(ir.debug_symbols.map((symbol) => [symbol.bp_offset, sanitizeIdentifier(symbol.name)]));
}

function formatBpName(bpOffset, localNameMap) {
  if (localNameMap.has(bpOffset)) return localNameMap.get(bpOffset);
  const disp = signedByte(bpOffset);
  return disp >= 0 ? `arg_${String(disp).padStart(2, "0")}` : `local_${String(Math.abs(disp)).padStart(2, "0")}`;
}

function intrinsicDisplayName(nameHint, ordinal) {
  if (!nameHint) return `intrinsic_${ordinal.toString(16).padStart(4, "0")}`;
  let display = String(nameHint).replaceAll("::", ".");
  display = display.replace(/(?<=\.)I_/u, "").replace(/^I_/u, "");
  const paren = display.indexOf("(");
  return paren >= 0 ? display.slice(0, paren) : display;
}

function pushExprFromOp(op, localNameMap) {
  const operands = op.operands;
  switch (op.mnemonic) {
    case "push_byte_immediate":
      return [String(operands.value_signed), 1];
    case "push_word_immediate":
      return [`0x${operands.value_u16.toString(16).padStart(4, "0")}`, 2];
    case "push_dword_immediate":
      return [`0x${operands.value_u32.toString(16).padStart(8, "0")}`, 4];
    case "push_string_immediate":
      return [formatScriptString(operands.string), Math.max(2, operands.declared_length)];
    case "push_local_byte":
    case "push_local_word":
    case "push_local_dword":
    case "push_local_string":
    case "push_local_slist":
    case "push_local_addr":
    case "push_string_ptr":
      return [formatBpName(operands.bp_offset, localNameMap), op.mnemonic.includes("dword") || op.mnemonic.includes("addr") ? 4 : 2];
    case "push_member_byte":
    case "push_member_word":
    case "push_member_dword":
    case "push_member_huge":
      return [`member.${formatBpName(operands.bp_offset, localNameMap)}`, op.mnemonic.includes("dword") || op.mnemonic.includes("huge") ? 4 : 2];
    case "push_local_list":
      return [formatBpName(operands.bp_offset, localNameMap), Math.max(2, operands.element_size)];
    case "push_list_element":
      return [`list_element(size=0x${operands.element_size.toString(16)})`, Math.max(1, operands.element_size)];
    case "push_huge":
      return [`0x${operands.value_a.toString(16).padStart(2, "0")}${operands.value_b.toString(16).padStart(2, "0")}`, 4];
    case "push_global":
      return [formatGlobalReference(operands.global_id), Math.max(1, operands.size)];
    case "global_address":
      return [`&${formatGlobalReference(operands.global_id)}`, 2];
    case "push_pid":
      return ["pid", 2];
    case "push_process_result":
      return ["process_result", 2];
    default:
      return null;
  }
}

function popStackBytes(stack, byteCount) {
  if (byteCount <= 0) return [];
  const parts = [];
  let consumed = 0;
  while (stack.length && consumed < byteCount) {
    const [expr, width] = stack.pop();
    parts.push(expr);
    consumed += Math.max(1, width);
  }
  return parts.reverse();
}

function popSizedValue(stack, byteCount, fallback = "value") {
  const parts = popStackBytes(stack, byteCount);
  if (!parts.length) return fallback;
  return parts.length === 1 ? parts[0] : `[${parts.join(", ")}]`;
}

function combineBinary(stack, operator, width = 2) {
  if (stack.length < 2) return;
  const [rightExpr] = stack.pop();
  const [leftExpr] = stack.pop();
  stack.push([`(${leftExpr} ${operator} ${rightExpr})`, width]);
}

function retagTopOfStack(stack, width) {
  if (!stack.length) return;
  const [expr] = stack.pop();
  stack.push([expr, width]);
}

function genericLoopSelectorCall(name, argumentsList) {
  return `${name}(${argumentsList.map(([label, expr]) => `${label}=${expr}`).join(", ")})`;
}

function formatLoopSelectorShapeArgs(shapeExprs) {
  if (!shapeExprs.length) {
    return null;
  }
  if (shapeExprs.length === 1) {
    return `shape=${shapeExprs[0]}`;
  }
  return `shapes=[${shapeExprs.join(", ")}]`;
}

function normalizeLoopOrigin(expr) {
  const text = String(expr).trim();
  return text.startsWith("*(") && text.endsWith(")") ? text.slice(2, -1) : text;
}

function evaluateLoopSetupOp(op, stack, localNameMap) {
  const pushed = pushExprFromOp(op, localNameMap);
  if (pushed) {
    stack.push(pushed);
    return true;
  }
  if (op.mnemonic === "push_indirect") {
    if (stack.length) {
      const [expr] = stack.pop();
      stack.push([`*(${expr})`, Math.max(1, op.operands.size)]);
    }
    return true;
  }
  if (["add", "add_dword", "sub", "sub_dword", "mul", "mul_dword", "div", "div_dword"].includes(op.mnemonic)) {
    combineBinary(stack, { add: "+", add_dword: "+", sub: "-", sub_dword: "-", mul: "*", mul_dword: "*", div: "/", div_dword: "/" }[op.mnemonic], op.mnemonic.endsWith("dword") ? 4 : 2);
    return true;
  }
  return op.mnemonic === "line_number";
}

function tryDecodeLoopSelector(ops, startIndex, localNameMap) {
  const selectorTokens = [];
  const selectorStack = [];
  let index = startIndex;
  while (index < ops.length) {
    const op = ops[index];
    if (op.mnemonic === "loopscr") {
      selectorTokens.push(op.operands.value_u8);
      index += 1;
      continue;
    }
    if (op.mnemonic === "loop") break;
    if (!evaluateLoopSetupOp(op, selectorStack, localNameMap)) return null;
    index += 1;
  }
  if (index >= ops.length || ops[index].mnemonic !== "loop") return null;
  const loopOperands = ops[index].operands;
  if (loopOperands.loop_type !== 0x2) return null;
  const currentVar = formatBpName(loopOperands.current_var, localNameMap);
  if (selectorTokens.length === 4 && selectorTokens[0] === 0x24 && selectorTokens[1] === 0x3d && selectorTokens[3] === 0x25) {
    const selectorField = LOOP_SELECTOR_FIELD_HINTS[selectorTokens[2]];
    if (selectorField && selectorStack.length >= 3) {
      return [`${currentVar} in nearby_items(${selectorField}=${selectorStack.at(-3)[0]}, origin=${normalizeLoopOrigin(selectorStack.at(-1)[0])})`, index + 1];
    }
  }
  if (selectorTokens.length === 2 && selectorTokens[0] === 0x24 && selectorTokens[1] === 0x42 && selectorStack.length >= 4) {
    return [
      `${currentVar} in ${genericLoopSelectorCall("selector_0x42", [
        ["arg0", selectorStack.at(-4)[0]],
        ["arg1", selectorStack.at(-3)[0]],
        ["arg2", selectorStack.at(-2)[0]],
        ["origin", normalizeLoopOrigin(selectorStack.at(-1)[0])]
      ])}`,
      index + 1
    ];
  }
  if (selectorTokens.length === 2 && selectorTokens[0] === 0x24 && selectorTokens[1] === 0x4c && selectorStack.length >= 3) {
    const origin = normalizeLoopOrigin(selectorStack.at(-1)[0]);
    const distance = selectorStack.at(-2)[0];
    const shapeExprs = selectorStack.slice(0, -2).map(([expr]) => expr);
    const shapeArgs = formatLoopSelectorShapeArgs(shapeExprs);
    if (shapeArgs) {
      return [`${currentVar} in nearby_items(${shapeArgs}, distance=${distance}, origin=${origin})`, index + 1];
    }
  }
  return null;
}

function loopSelectorStatement(selectorText) {
  return `/* loop_selector ${selectorText} */`;
}

function buildScriptBlocks(ir) {
  const ops = ir.ops;
  if (!ops.length) return [{}, []];
  const branchMnemonics = new Set(["jne", "jmp", "foreach_list", "foreach_slist"]);
  const leaders = new Set([ops[0].absolute_body_offset]);
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index];
    const targetOffset = op.operands.target_offset;
    if (Number.isInteger(targetOffset)) {
      leaders.add(ir.event.derived_body_start + targetOffset);
      if (branchMnemonics.has(op.mnemonic) && index + 1 < ops.length) leaders.add(ops[index + 1].absolute_body_offset);
    }
  }
  const orderedLeaders = [...leaders].sort((left, right) => left - right);
  const labelMap = { [orderedLeaders[0]]: "entry" };
  for (const leader of orderedLeaders.slice(1)) labelMap[leader] = `block_${leader.toString(16).padStart(4, "0")}`;
  const blocks = [];
  let currentLabel = labelMap[ops[0].absolute_body_offset];
  let currentOps = [];
  for (const op of ops) {
    if (labelMap[op.absolute_body_offset] && currentOps.length && labelMap[op.absolute_body_offset] !== currentLabel) {
      blocks.push([currentLabel, currentOps]);
      currentLabel = labelMap[op.absolute_body_offset];
      currentOps = [];
    }
    currentOps.push(op);
  }
  if (currentOps.length) blocks.push([currentLabel, currentOps]);
  return [labelMap, blocks];
}

function targetEventDisplayName(operands) {
  const key = `${operands.target_class_id}:${operands.target_event_slot}`;
  return CLASS_EVENT_NAME_HINTS[key] ?? operands.target_event_name_hint ?? `slot_${operands.target_event_slot.toString(16).padStart(2, "0")}`;
}

function formatTargetEventReference(operands) {
  const className = operands.target_class_name_hint ? sanitizeIdentifier(operands.target_class_name_hint) : `class_${operands.target_class_id.toString(16).padStart(4, "0")}`;
  return `${className}.${sanitizeIdentifier(targetEventDisplayName(operands))}`;
}

function decompilePseudocodeBlocks(ir) {
  const [labelMap, blocks] = buildScriptBlocks(ir);
  const localNameMap = buildLocalNameMap(ir);
  const skipMnemonics = new Set(["line_number", "symbol_info", "add_sp", "init", "loopscr", "loop"]);
  const discardTopMnemonics = new Set(["pop_temp", "pop_temp_dword", "pop_global", "free_stack_string", "free_stack_list", "free_stack_slist"]);
  const discardLocalCleanupMnemonics = new Set(["free_local_string", "free_local_slist", "free_local_list"]);
  const transparentConversionMnemonics = new Set(["copy_string", "ptr_to_string", "str_to_ptr"]);
  const renderedBlocks = [];

  for (const [label, ops] of blocks) {
    let currentLabel = label;
    const stack = [];
    let pendingResult = null;
    const blockLines = [];
    let syntheticIndex = 0;

    function flushBlock(nextLabel = null) {
      if (blockLines.length) {
        renderedBlocks.push([currentLabel, [...blockLines]]);
        blockLines.length = 0;
      }
      if (nextLabel) {
        currentLabel = nextLabel;
      }
    }

    function flushPendingResultStatement() {
      if (!pendingResult) return;
      blockLines.push(`${pendingResult};`);
      pendingResult = null;
    }

    let index = 0;
    while (index < ops.length) {
      const op = ops[index];
      const pushed = pushExprFromOp(op, localNameMap);

      if (
        pendingResult &&
        ![
          "line_number",
          "symbol_info",
          "add_sp",
          "push_retval_byte",
          "push_retval_word",
          "push_retval_dword"
        ].includes(op.mnemonic)
      ) {
        flushPendingResultStatement();
      }

      if (op.mnemonic === "loopscr") {
        const decodedLoop = tryDecodeLoopSelector(ops, index, localNameMap);
        if (decodedLoop) {
          flushBlock(`${label}_selector_${String(syntheticIndex).padStart(2, "0")}`);
          blockLines.push(loopSelectorStatement(decodedLoop[0]));
          flushBlock(`${label}_cont_${String(syntheticIndex).padStart(2, "0")}`);
          syntheticIndex += 1;
          stack.length = 0;
          pendingResult = null;
          index = decodedLoop[1];
          continue;
        }
      }

      if (pushed) {
        stack.push(pushed);
        index += 1;
        continue;
      }

      if (skipMnemonics.has(op.mnemonic)) {
        index += 1;
        continue;
      }

      if (discardTopMnemonics.has(op.mnemonic)) {
        if (stack.length) stack.pop();
        index += 1;
        continue;
      }

      if (discardLocalCleanupMnemonics.has(op.mnemonic)) {
        index += 1;
        continue;
      }

      if (op.mnemonic === "pop_result") {
        const expr = stack.length ? stack.pop()[0] : "value";
        blockLines.push(`process_result = ${expr};`);
        index += 1;
        continue;
      }

      if (op.mnemonic === "word_to_dword") {
        retagTopOfStack(stack, 4);
        index += 1;
        continue;
      }

      if (op.mnemonic === "dword_to_word") {
        retagTopOfStack(stack, 2);
        index += 1;
        continue;
      }

      if (transparentConversionMnemonics.has(op.mnemonic)) {
        index += 1;
        continue;
      }

      if (op.mnemonic === "push_indirect") {
        if (stack.length) {
          const [expr] = stack.pop();
          if (/^&(?:[A-Za-z_][A-Za-z0-9_]*|global\[0x[0-9a-f]{4}\])$/iu.test(expr)) {
            stack.push([expr.slice(1), Math.max(1, op.operands.size)]);
          } else {
            stack.push([`*(${expr})`, Math.max(1, op.operands.size)]);
          }
        }
        index += 1;
        continue;
      }

      if (op.mnemonic === "set_info") {
        blockLines.push(`set_info(${stack.map(([expr]) => expr).join(", ")});`);
        stack.length = 0;
        index += 1;
        continue;
      }
      if (op.mnemonic === "process_exclude") {
        blockLines.push("process_exclude();");
        index += 1;
        continue;
      }
      if (op.mnemonic === "call_intrinsic") {
        const argExprs = popStackBytes(stack, op.operands.arg_bytes);
        pendingResult = `${intrinsicDisplayName(op.operands.intrinsic_name_hint, op.operands.intrinsic_ordinal)}(${argExprs.join(", ")})`;
        index += 1;
        continue;
      }
      if (["push_retval_byte", "push_retval_word", "push_retval_dword"].includes(op.mnemonic)) {
        stack.push([pendingResult || "retval", op.mnemonic.endsWith("dword") ? 4 : op.mnemonic.endsWith("word") ? 2 : 1]);
        pendingResult = null;
        index += 1;
        continue;
      }
      if (op.mnemonic === "call_class_event") {
        blockLines.push(`${formatTargetEventReference(op.operands)}(${stack.map(([expr]) => expr).join(", ")});`);
        stack.length = 0;
        pendingResult = null;
        index += 1;
        continue;
      }
      if (op.mnemonic === "spawn") {
        blockLines.push(`spawn ${formatTargetEventReference(op.operands)}(${stack.map(([expr]) => expr).join(", ")});`);
        stack.length = 0;
        pendingResult = null;
        index += 1;
        continue;
      }
      if (op.mnemonic === "spawn_inline") {
        blockLines.push(`spawn_inline ${formatTargetEventReference(op.operands)}(${stack.map(([expr]) => expr).join(", ")}) /* inline=0x${op.operands.inline_offset.toString(16).padStart(4, "0")} */;`);
        stack.length = 0;
        pendingResult = null;
        index += 1;
        continue;
      }

      if (op.mnemonic === "create_list") {
        const elements = [];
        for (let count = 0; count < op.operands.count; count += 1) {
          elements.push(popSizedValue(stack, Math.max(1, op.operands.element_size)));
        }
        stack.push([`[${elements.join(", ")}]`, 2]);
        index += 1;
        continue;
      }

      if (op.mnemonic === "append_list") {
        combineBinary(stack, "+", 2);
        index += 1;
        continue;
      }

      if (["add", "add_dword", "sub", "sub_dword", "mul", "mul_dword", "div", "div_dword", "mod", "mod_dword", "concat", "lsh", "rsh"].includes(op.mnemonic)) {
        combineBinary(
          stack,
          {
            add: "+",
            add_dword: "+",
            sub: "-",
            sub_dword: "-",
            mul: "*",
            mul_dword: "*",
            div: "/",
            div_dword: "/",
            mod: "%",
            mod_dword: "%",
            concat: "+",
            lsh: "<<",
            rsh: ">>"
          }[op.mnemonic],
          op.mnemonic.endsWith("dword") ? 4 : 2
        );
        index += 1;
        continue;
      }
      if (op.mnemonic === "strcmp") {
        const [leftExpr, rightExpr] = popStackBytes(stack, 4);
        stack.push([`(strcmp(${leftExpr ?? 'lhs'}, ${rightExpr ?? 'rhs'}) == 0)`, 1]);
        index += 1;
        continue;
      }
      if (["bit_and", "bit_or", "and", "and_dword", "or", "or_dword", "cmp", "cmp_dword", "ne", "ne_dword", "lt", "lt_dword", "le", "le_dword", "gt", "gt_dword", "ge", "ge_dword"].includes(op.mnemonic)) {
        combineBinary(
          stack,
          {
            bit_and: "&",
            bit_or: "|",
            and: "&&",
            and_dword: "&&",
            or: "||",
            or_dword: "||",
            cmp: "==",
            cmp_dword: "==",
            ne: "!=",
            ne_dword: "!=",
            lt: "<",
            lt_dword: "<",
            le: "<=",
            le_dword: "<=",
            gt: ">",
            gt_dword: ">",
            ge: ">=",
            ge_dword: ">="
          }[op.mnemonic]
        );
        index += 1;
        continue;
      }
      if (["not", "not_dword", "bit_not"].includes(op.mnemonic)) {
        if (stack.length) {
          const [expr, width] = stack.pop();
          stack.push([`${op.mnemonic === "bit_not" ? "~" : "!"}${expr}`.startsWith("~") ? `(~${expr})` : `(!${expr})`, width]);
        }
        index += 1;
        continue;
      }
      if (op.mnemonic === "implies") {
        const expr = stack.length ? stack.pop()[0] : "retval";
        stack.push([`implies(${expr}, 0x${op.operands.arg0.toString(16)}, 0x${op.operands.arg1.toString(16)})`, 1]);
        index += 1;
        continue;
      }
      if (op.mnemonic === "suspend") {
        blockLines.push("suspend;");
        stack.length = 0;
        index += 1;
        continue;
      }
      if (op.mnemonic === "loopnext") {
        stack.length = 0;
        index += 1;
        continue;
      }
      if (op.mnemonic === "jne") {
        const targetAbsolute = ir.event.derived_body_start + op.operands.target_offset;
        const condition = stack.length ? stack.pop()[0] : "condition";
        blockLines.push(`if ${formatFalseBranchCondition(condition)} goto ${labelMap[targetAbsolute] ?? `block_${targetAbsolute.toString(16).padStart(4, "0")}`};`);
        index += 1;
        continue;
      }
      if (op.mnemonic === "jmp") {
        const targetAbsolute = ir.event.derived_body_start + op.operands.target_offset;
        blockLines.push(`goto ${labelMap[targetAbsolute] ?? `block_${targetAbsolute.toString(16).padStart(4, "0")}`};`);
        stack.length = 0;
        index += 1;
        continue;
      }
      if (op.mnemonic === "foreach_list" || op.mnemonic === "foreach_slist") {
        const targetAbsolute = ir.event.derived_body_start + op.operands.target_offset;
        blockLines.push(`${op.mnemonic} ${formatBpName(op.operands.bp_offset, localNameMap)} -> ${labelMap[targetAbsolute] ?? `block_${targetAbsolute.toString(16).padStart(4, "0")}`};`);
        index += 1;
        continue;
      }
      if (op.mnemonic === "ret") {
        flushPendingResultStatement();
        blockLines.push("return;");
        stack.length = 0;
        break;
      }
      if (op.mnemonic.startsWith("pop_local_") || op.mnemonic.startsWith("pop_member_")) {
        const expr = stack.length ? stack.pop()[0] : "value";
        blockLines.push(`${formatBpName(op.operands.bp_offset, localNameMap)} = ${expr};`);
        index += 1;
        continue;
      }

      blockLines.push(`/* ${op.mnemonic} */`);
      index += 1;
    }
    flushPendingResultStatement();
    flushBlock();
  }

  return renderedBlocks;
}

function parseTerminalStatement(statement) {
  if (statement === "return;") return { kind: "return" };
  let match = /^goto ([A-Za-z0-9_]+);$/u.exec(statement);
  if (match) return { kind: "goto", target: match[1] };
  match = /^if (.+) goto ([A-Za-z0-9_]+);$/u.exec(statement);
  return match ? { kind: "if", condition: match[1], target: match[2] } : null;
}

function stripOuterParens(expr) {
  let text = String(expr).trim();
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let balanced = true;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0 && index !== text.length - 1) {
        balanced = false;
        break;
      }
      if (depth < 0) {
        balanced = false;
        break;
      }
    }
    if (!balanced || depth !== 0) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

function hasTopLevelLogicalOperator(expr) {
  const text = stripOuterParens(expr);
  let depth = 0;
  for (let index = 0; index < text.length - 1; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth === 0) {
      const pair = text.slice(index, index + 2);
      if (pair === "&&" || pair === "||") return true;
    }
  }
  return false;
}

function invertConditionText(condition) {
  const expr = stripOuterParens(condition);
  if (expr.startsWith("!")) return stripOuterParens(expr.slice(1));
  if (hasTopLevelLogicalOperator(expr)) return `!(${expr})`;
  for (const [source, replacement] of [[" != ", " == "], [" == ", " != "], [" <= ", " > "], [" >= ", " < "], [" < ", " >= "], [" > ", " <= "]]) {
    if (expr.includes(source)) return expr.replace(source, replacement);
  }
  return /^[A-Za-z_][A-Za-z0-9_:.]*(\(.*\))?$/u.test(expr) ? `!${expr}` : `!(${expr})`;
}

function formatFalseBranchCondition(condition) {
  return invertConditionText(condition || "condition");
}

function indentLines(lines, prefix = "  ") {
  return lines.map((line) => (line ? `${prefix}${line}` : ""));
}

function resolveLabelIndex(labelToIndex, label) {
  if (label == null) return null;
  const direct = labelToIndex.get(label);
  if (direct != null) return direct;
  for (const [candidateLabel, candidateIndex] of labelToIndex.entries()) {
    if (candidateLabel === `${label}_selector_00` || candidateLabel === `${label}_cont_00`) {
      return candidateIndex;
    }
    if (candidateLabel.startsWith(`${label}_selector_`) || candidateLabel.startsWith(`${label}_cont_`)) {
      return candidateIndex;
    }
  }

  const numericMatch = /^block_([0-9a-fA-F]{4,})$/u.exec(label);
  if (numericMatch) {
    const targetValue = Number.parseInt(numericMatch[1], 16);
    let bestCandidate = null;
    for (const [candidateLabel, candidateIndex] of labelToIndex.entries()) {
      const candidateMatch = /^block_([0-9a-fA-F]{4,})(?:_(?:selector|cont)_\d+)?$/u.exec(candidateLabel);
      if (!candidateMatch) continue;
      const candidateValue = Number.parseInt(candidateMatch[1], 16);
      if (candidateValue < targetValue) continue;
      if (bestCandidate == null || candidateValue < bestCandidate.value || (candidateValue === bestCandidate.value && candidateIndex < bestCandidate.index)) {
        bestCandidate = { value: candidateValue, index: candidateIndex };
      }
    }
    if (bestCandidate != null) {
      return bestCandidate.index;
    }
  }

  return null;
}

function parseSelectorCondition(condition) {
  const expr = stripOuterParens(condition);
  const match = /^(.+?)\s*!=\s*(.+)$/u.exec(expr);
  return match ? [match[1].trim(), match[2].trim()] : null;
}

function parseEqualityCondition(condition) {
  const expr = stripOuterParens(condition);
  const match = /^(.+?)\s*==\s*(.+)$/u.exec(expr);
  return match ? [match[1].trim(), match[2].trim()] : null;
}

function parseIntegerLiteral(text) {
  const trimmed = String(text ?? "").trim();
  if (!/^-?(?:0x[0-9a-fA-F]+|\d+)$/u.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  const radix = raw.toLowerCase().startsWith("0x") ? 16 : 10;
  const magnitude = Number.parseInt(raw, radix);
  if (!Number.isSafeInteger(magnitude)) return null;
  return {
    value: negative ? -magnitude : magnitude,
    radix,
    text: trimmed
  };
}

function shouldPreferDecimalSwitchCases(caseValues) {
  if (!caseValues.length) return false;
  const parsedValues = caseValues.map(parseIntegerLiteral);
  if (parsedValues.some((value) => value == null)) return false;
  return parsedValues.every((value) => value.value >= 0 && value.value <= 0xff);
}

function formatSwitchCaseValue(caseValue, preferDecimal) {
  if (!preferDecimal) return caseValue;
  const parsed = parseIntegerLiteral(caseValue);
  return parsed ? String(parsed.value) : caseValue;
}

function parseLoopSelectorStatement(statement) {
  const match = /^\/\* loop_selector (.+) \*\/$/u.exec(statement);
  return match ? match[1] : null;
}

function parseForeachLoopStatement(statement) {
  const match = /^(foreach_(?:s)?list\s+.+?\s+->\s+)([A-Za-z0-9_]+);$/u.exec(statement);
  return match ? { header: `${match[1]}${match[2]};`, target: match[2] } : null;
}

function isLoopSelectorOnlyBlock(statements) {
  return statements.length === 1 && parseLoopSelectorStatement(statements[0]) != null;
}

function findNearestLoopSelector(blocks, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const statements = blocks[cursor][1];
    if (!statements.length) continue;
    if (isLoopSelectorOnlyBlock(statements)) {
      return parseLoopSelectorStatement(statements[0]);
    }
    break;
  }
  return null;
}

function mergeExitLabels(...parts) {
  const merged = new Set();
  for (const part of parts) {
    if (part == null) continue;
    if (part instanceof Set) {
      for (const value of part) merged.add(value);
      continue;
    }
    merged.add(part);
  }
  return merged;
}

function isCommentStatement(statement) {
  return /^\/\*.*\*\/$/u.test(String(statement).trim());
}

function isReturnOnlyBlock(statements) {
  return statements.length > 0
    && statements.at(-1) === "return;"
    && statements.slice(0, -1).every((statement) => isCommentStatement(statement));
}

function detectNoopCompareChain(blocks, labelToIndex, startIndex, endIndex) {
  let cursor = startIndex;
  let commonTarget = null;

  while (cursor + 1 < endIndex) {
    const compareStatements = blocks[cursor][1];
    const gotoStatements = blocks[cursor + 1][1];
    if (compareStatements.length !== 1 || gotoStatements.length !== 1) {
      return null;
    }

    const compareTerminal = parseTerminalStatement(compareStatements[0]);
    const gotoTerminal = parseTerminalStatement(gotoStatements[0]);
    if (!compareTerminal || compareTerminal.kind !== "if") {
      return null;
    }
    if (!gotoTerminal || gotoTerminal.kind !== "goto") {
      return null;
    }

    if (commonTarget == null) {
      commonTarget = gotoTerminal.target;
    } else if (gotoTerminal.target !== commonTarget) {
      return null;
    }

    if (compareTerminal.target === commonTarget) {
      const bodyIndex = resolveLabelIndex(labelToIndex, commonTarget ?? "");
      if (bodyIndex == null || bodyIndex !== cursor + 2 || bodyIndex >= endIndex) {
        return null;
      }
      return bodyIndex;
    }

    const nextIndex = resolveLabelIndex(labelToIndex, compareTerminal.target ?? "");
    if (nextIndex == null || nextIndex !== cursor + 2 || nextIndex >= endIndex) {
      return null;
    }
    cursor += 2;
  }

  return null;
}

function renderSelectorChain(blocks, labelToIndex, startIndex, endIndex, returnLabels, exitLabels = new Set(), activeRegions = new Set(), renderCache = new Map()) {
  if (!blocks[startIndex][1].length) return null;
  const baseTerminal = parseTerminalStatement(blocks[startIndex][1].at(-1));
  if (!baseTerminal || baseTerminal.kind !== "if") return null;

  const selector = parseSelectorCondition(baseTerminal.condition);
  if (!selector) return null;
  const [selectorExpr] = selector;

  let cursor = startIndex;
  let joinLabel = null;
  const branches = [];

  while (cursor < endIndex) {
    const statements = blocks[cursor][1];
    if (!statements.length) return null;
    const terminal = parseTerminalStatement(statements.at(-1));
    if (!terminal || terminal.kind !== "if") return null;

    const parsed = parseSelectorCondition(terminal.condition);
    if (!parsed || parsed[0] !== selectorExpr) return null;

    const targetLabel = terminal.target ?? "";
    const targetIndex = resolveLabelIndex(labelToIndex, targetLabel);
    if (targetIndex == null || targetIndex <= cursor + 1 || targetIndex > endIndex) return null;

    const bodyTailIndex = lastNonemptyBlockIndex(blocks, cursor + 1, targetIndex);
    if (bodyTailIndex == null) return null;
    const bodyTailTerminal = parseTerminalStatement(blocks[bodyTailIndex][1].at(-1));
    if (!bodyTailTerminal || bodyTailTerminal.kind !== "goto") return null;

    const currentJoin = bodyTailTerminal.target ?? "";
    const currentJoinIndex = resolveLabelIndex(labelToIndex, currentJoin);
    if (currentJoinIndex == null || currentJoinIndex > endIndex) return null;
    if (currentJoinIndex < targetIndex) return null;
    if (currentJoinIndex === targetIndex && targetLabel !== currentJoin) return null;

    if (joinLabel == null) {
      joinLabel = currentJoin;
    } else if (currentJoin !== joinLabel) {
      return null;
    }

    const bodyResult = renderStructuredRegion(
      blocks,
      labelToIndex,
      cursor + 1,
      targetIndex,
      returnLabels,
      mergeExitLabels(exitLabels, joinLabel),
      activeRegions,
      renderCache
    );
    if (!bodyResult) return null;
    branches.push([invertConditionText(terminal.condition ?? "condition"), bodyResult[0]]);

    if (targetLabel === joinLabel) {
      break;
    }
    cursor = targetIndex;
  }

  if (joinLabel == null) return null;

  const switchBranches = [];
  let canRenderSwitch = branches.length >= 3;
  if (canRenderSwitch) {
    for (const [condition, bodyLines] of branches) {
      const parsed = parseEqualityCondition(condition);
      if (!parsed || parsed[0] !== selectorExpr) {
        canRenderSwitch = false;
        break;
      }
      switchBranches.push([parsed[1], bodyLines]);
    }
  }

  if (canRenderSwitch) {
    const preferDecimalCases = shouldPreferDecimalSwitchCases(switchBranches.map(([caseValue]) => caseValue));
    const rendered = [`switch (${selectorExpr}) {`];
    for (const [caseValue, bodyLines] of switchBranches) {
      rendered.push(`case ${formatSwitchCaseValue(caseValue, preferDecimalCases)}:`);
      rendered.push(...indentLines(bodyLines));
      if (bodyLines.at(-1) !== "return;") {
        rendered.push("  break;");
      }
    }
    rendered.push("}");
    return [rendered, resolveLabelIndex(labelToIndex, joinLabel)];
  }

  const rendered = [];
  for (let index = 0; index < branches.length; index += 1) {
    const [condition, bodyLines] = branches[index];
    rendered.push(`${index === 0 ? "if" : "else if"} (${condition}) {`);
    rendered.push(...indentLines(bodyLines));
    rendered.push("}");
  }

  return [rendered, resolveLabelIndex(labelToIndex, joinLabel)];
}

function lastNonemptyBlockIndex(blocks, startIndex, endIndex) {
  for (let index = endIndex - 1; index >= startIndex; index -= 1) {
    if (blocks[index][1].length) return index;
  }
  return null;
}

function renderLoopConstruct(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels = new Set(), activeRegions = new Set(), renderCache = new Map()) {
  const statements = blocks[index][1];
  if (!statements.length) return null;
  const terminal = parseTerminalStatement(statements.at(-1));
  if (!terminal || terminal.kind !== "if") return null;

  const targetIndex = resolveLabelIndex(labelToIndex, terminal.target);
  if (targetIndex == null || targetIndex <= index || targetIndex > endIndex) return null;

  const loopTailIndex = lastNonemptyBlockIndex(blocks, index + 1, targetIndex);
  if (loopTailIndex == null) return null;
  const loopTailTerminal = parseTerminalStatement(blocks[loopTailIndex][1].at(-1));
  if (!loopTailTerminal || loopTailTerminal.kind !== "goto" || loopTailTerminal.target !== blocks[index][0]) return null;

  const loopBody = renderStructuredRegion(
    blocks,
    labelToIndex,
    index + 1,
    targetIndex,
    returnLabels,
    mergeExitLabels(exitLabels, blocks[index][0]),
    activeRegions,
    renderCache
  );
  if (!loopBody) return null;

  const loopSelector = findNearestLoopSelector(blocks, index);

  const rendered = [];
  rendered.push(loopSelector ? `for ${loopSelector} {` : `while (${invertConditionText(terminal.condition)}) {`);
  rendered.push(...indentLines(loopBody[0]));
  rendered.push("}");
  return [rendered, targetIndex];
}

function renderInfiniteLoopConstruct(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels = new Set(), activeRegions = new Set(), renderCache = new Map()) {
  if (index + 1 >= endIndex) return null;
  const loopLabel = blocks[index][0];
  let loopTailIndex = null;
  for (let cursor = endIndex - 1; cursor > index; cursor -= 1) {
    const statements = blocks[cursor][1];
    if (!statements.length) continue;
    const terminal = parseTerminalStatement(statements.at(-1));
    if (terminal && terminal.kind === "goto" && terminal.target === loopLabel) {
      loopTailIndex = cursor;
      break;
    }
  }
  if (loopTailIndex == null) return null;

  const loopBody = renderStructuredRegion(
    blocks,
    labelToIndex,
    index,
    loopTailIndex + 1,
    returnLabels,
    mergeExitLabels(exitLabels, loopLabel),
    activeRegions,
    renderCache
  );
  if (!loopBody) return null;

  const rendered = ["while (true) {"];
  rendered.push(...indentLines(loopBody[0]));
  rendered.push("}");
  return [rendered, loopTailIndex + 1];
}

function renderSelectorLoopConstruct(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels = new Set(), activeRegions = new Set(), renderCache = new Map()) {
  const statements = blocks[index][1];
  const loopSelector = statements.length === 1 ? parseLoopSelectorStatement(statements[0]) : null;
  if (!loopSelector || index + 1 >= endIndex) return null;

  const [nextLabel, nextStatements] = blocks[index + 1];
  const nextTerminal = nextStatements.length ? parseTerminalStatement(nextStatements.at(-1)) : null;
  if (!nextTerminal || nextTerminal.kind !== "if") return null;

  const targetIndex = resolveLabelIndex(labelToIndex, nextTerminal.target ?? "");
  if (targetIndex == null || targetIndex <= index + 1 || targetIndex > endIndex) return null;

  const loopTailIndex = lastNonemptyBlockIndex(blocks, index + 2, targetIndex);
  if (loopTailIndex == null) return null;

  const loopTailTerminal = parseTerminalStatement(blocks[loopTailIndex][1].at(-1));
  if (!loopTailTerminal || loopTailTerminal.kind !== "goto" || loopTailTerminal.target !== nextLabel) return null;

  const loopBody = renderStructuredRegion(
    blocks,
    labelToIndex,
    index + 2,
    targetIndex,
    returnLabels,
    mergeExitLabels(exitLabels, nextLabel),
    activeRegions,
    renderCache
  );
  if (!loopBody) return null;

  const rendered = [`for ${loopSelector} {`];
  rendered.push(...indentLines(loopBody[0]));
  rendered.push("}");
  return [rendered, targetIndex];
}

function renderForeachLoopConstruct(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels = new Set(), activeRegions = new Set(), renderCache = new Map()) {
  const statements = blocks[index][1];
  if (!statements.length) return null;

  const foreachLoop = parseForeachLoopStatement(statements.at(-1));
  if (!foreachLoop) return null;

  const targetIndex = resolveLabelIndex(labelToIndex, foreachLoop.target);
  if (targetIndex == null || targetIndex <= index || targetIndex > endIndex) return null;

  const loopTailIndex = lastNonemptyBlockIndex(blocks, index + 1, targetIndex);
  if (loopTailIndex == null) return null;

  const loopTailTerminal = parseTerminalStatement(blocks[loopTailIndex][1].at(-1));
  if (!loopTailTerminal || loopTailTerminal.kind !== "goto" || loopTailTerminal.target !== blocks[index][0]) return null;

  const loopBody = renderStructuredRegion(
    blocks,
    labelToIndex,
    index + 1,
    targetIndex,
    returnLabels,
    mergeExitLabels(exitLabels, blocks[index][0]),
    activeRegions,
    renderCache
  );
  if (!loopBody) return null;

  const rendered = ["while (true) {"];
  rendered.push(...indentLines(statements.slice(0, -1)));
  rendered.push(`  ${foreachLoop.header}`);
  rendered.push(...indentLines(loopBody[0]));
  rendered.push("}");
  return [rendered, targetIndex];
}

function renderStructuredRegion(blocks, labelToIndex, startIndex, endIndex, returnLabels, exitLabels = new Set(), activeRegions = new Set(), renderCache = new Map()) {
  const regionKey = JSON.stringify([startIndex, endIndex, [...exitLabels].sort()]);
  if (renderCache.has(regionKey)) return renderCache.get(regionKey);
  if (activeRegions.has(regionKey)) return null;
  const nextActive = new Set(activeRegions);
  nextActive.add(regionKey);
  const lines = [];
  let index = startIndex;

  while (index < endIndex) {
    const skippedIndex = detectNoopCompareChain(blocks, labelToIndex, index, endIndex);
    if (skippedIndex != null) {
      index = skippedIndex;
      continue;
    }

    const statements = blocks[index][1];
    if (!statements.length) {
      index += 1;
      continue;
    }

    if (isLoopSelectorOnlyBlock(statements)) {
      const selectorLoopConstruct = renderSelectorLoopConstruct(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels, nextActive, renderCache);
      if (selectorLoopConstruct) {
        lines.push(...selectorLoopConstruct[0]);
        index = selectorLoopConstruct[1];
        continue;
      }
      index += 1;
      continue;
    }

    const foreachLoopConstruct = renderForeachLoopConstruct(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels, nextActive, renderCache);
    if (foreachLoopConstruct) {
      lines.push(...foreachLoopConstruct[0]);
      index = foreachLoopConstruct[1];
      continue;
    }

    const terminal = parseTerminalStatement(statements.at(-1));
    if (!terminal) {
      lines.push(...statements);
      index += 1;
      continue;
    }

    lines.push(...statements.slice(0, -1));

    if (terminal.kind === "return") {
      lines.push("return;");
      const result = [lines, false];
      renderCache.set(regionKey, result);
      return result;
    }
    if (terminal.kind === "goto") {
      if (returnLabels.has(terminal.target)) {
        lines.push("return;");
        const result = [lines, false];
        renderCache.set(regionKey, result);
        return result;
      }
      if (exitLabels.has(terminal.target)) {
        const result = [lines, false];
        renderCache.set(regionKey, result);
        return result;
      }
      const targetIndex = resolveLabelIndex(labelToIndex, terminal.target);
      if (targetIndex == null) return null;
      if (targetIndex === endIndex) {
        const result = [lines, false];
        renderCache.set(regionKey, result);
        return result;
      }
      if (targetIndex === index + 1) {
        index += 1;
        continue;
      }
      if (index < targetIndex && targetIndex < endIndex) {
        index = targetIndex;
        continue;
      }
      return null;
    }

    const targetIndex = resolveLabelIndex(labelToIndex, terminal.target);
    if (targetIndex == null || targetIndex <= index || targetIndex > endIndex) return null;
    if (targetIndex === index + 1) {
      index += 1;
      continue;
    }

    const selectorChain = renderSelectorChain(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels, nextActive, renderCache);
    if (selectorChain) {
      lines.push(...selectorChain[0]);
      index = selectorChain[1];
      continue;
    }

    const loopConstruct = renderLoopConstruct(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels, nextActive, renderCache);
    if (loopConstruct) {
      lines.push(...loopConstruct[0]);
      index = loopConstruct[1];
      continue;
    }

    const infiniteLoopConstruct = renderInfiniteLoopConstruct(blocks, labelToIndex, index, endIndex, returnLabels, exitLabels, nextActive, renderCache);
    if (infiniteLoopConstruct) {
      lines.push(...infiniteLoopConstruct[0]);
      index = infiniteLoopConstruct[1];
      continue;
    }

    const trueTailIndex = lastNonemptyBlockIndex(blocks, index + 1, targetIndex);
    if (trueTailIndex != null) {
      const trueTailTerminal = parseTerminalStatement(blocks[trueTailIndex][1].at(-1));
      if (trueTailTerminal && trueTailTerminal.kind === "goto") {
        const joinLabel = trueTailTerminal.target ?? "";
        const joinIndex = resolveLabelIndex(labelToIndex, joinLabel);
        if (joinIndex != null && joinIndex > targetIndex && joinIndex <= endIndex) {
          const trueResult = renderStructuredRegion(
            blocks,
            labelToIndex,
            index + 1,
            targetIndex,
            returnLabels,
            mergeExitLabels(exitLabels, joinLabel),
            nextActive,
            renderCache
          );
          const falseResult = renderStructuredRegion(
            blocks,
            labelToIndex,
            targetIndex,
            joinIndex,
            returnLabels,
            mergeExitLabels(exitLabels, joinLabel),
            nextActive,
            renderCache
          );
          if (trueResult && falseResult) {
            lines.push(`if (${invertConditionText(terminal.condition)}) {`);
            lines.push(...indentLines(trueResult[0]));
            lines.push("}");
            if (falseResult[0].length) {
              if (falseResult[0][0].startsWith("if ")) {
                lines.push(`else ${falseResult[0][0]}`);
                lines.push(...falseResult[0].slice(1));
              } else {
                lines.push("else {");
                lines.push(...indentLines(falseResult[0]));
                lines.push("}");
              }
            }
            index = joinIndex;
            continue;
          }
        }
      }
    }

    const inner = renderStructuredRegion(blocks, labelToIndex, index + 1, targetIndex, returnLabels, new Set(exitLabels), nextActive, renderCache);
    if (!inner) {
      renderCache.set(regionKey, null);
      return null;
    }
    lines.push(`if (${invertConditionText(terminal.condition)}) {`);
    lines.push(...indentLines(inner[0]));
    lines.push("}");
    index = targetIndex;
  }

  const result = [lines, true];
  renderCache.set(regionKey, result);
  return result;
}

function renderStructuredPseudocode(blocks) {
  if (!blocks.length) return [];
  const labelToIndex = new Map(blocks.map(([label], index) => [label, index]));
  const returnLabels = new Set(blocks.filter(([, statements]) => isReturnOnlyBlock(statements)).map(([label]) => label));
  const rendered = renderStructuredRegion(blocks, labelToIndex, 0, blocks.length, returnLabels);
  return rendered ? rendered[0] : null;
}

export const __testHooks = {
  buildClassRows,
  buildIrForEvent,
  decompilePseudocodeBlocks,
  getIntrinsicNameHint,
  parseForeachLoopStatement,
  renderForeachLoopConstruct,
  renderPseudocode,
  renderStructuredPseudocode,
  renderSelectorLoopConstruct
};

function renderPartiallyStructuredBlocks(blocks) {
  if (!blocks.length) return [];
  const labelToIndex = new Map(blocks.map(([label], index) => [label, index]));
  const returnLabels = new Set(blocks.filter(([, statements]) => isReturnOnlyBlock(statements)).map(([label]) => label));
  const lines = [];
  let index = 0;
  while (index < blocks.length) {
    const [label, statements] = blocks[index];
    if (isReturnOnlyBlock(statements)) {
      lines.push(...statements.map((statement) => `  ${statement}`));
      lines.push("");
      index += 1;
      continue;
    }

    if (isLoopSelectorOnlyBlock(statements)) {
      const loopSelector = parseLoopSelectorStatement(statements[0]);
      if (loopSelector && index + 1 < blocks.length) {
        const [nextLabel, nextStatements] = blocks[index + 1];
        const nextTerminal = nextStatements.length ? parseTerminalStatement(nextStatements.at(-1)) : null;
        if (nextTerminal?.kind === "if") {
          const targetIndex = resolveLabelIndex(labelToIndex, nextTerminal.target ?? "");
          if (targetIndex != null && targetIndex > index + 1) {
            const loopTailIndex = lastNonemptyBlockIndex(blocks, index + 2, targetIndex);
            if (loopTailIndex != null) {
              const loopTailTerminal = parseTerminalStatement(blocks[loopTailIndex][1].at(-1));
              if (loopTailTerminal?.kind === "goto" && loopTailTerminal.target === nextLabel) {
                const loopBody = renderStructuredRegion(blocks, labelToIndex, index + 2, targetIndex, returnLabels, new Set([nextLabel]));
                if (loopBody) {
                  lines.push(`  for ${loopSelector} {`);
                  lines.push(...indentLines(loopBody[0], "    "));
                  lines.push("  }");
                  lines.push("");
                  index = targetIndex;
                  continue;
                }
              }
            }
          }
        }
      }

      lines.push(`  ${label}:`);
      lines.push(`    ${statements[0]}`);
      lines.push("");
      index += 1;
      continue;
    }

    const terminal = statements.length ? parseTerminalStatement(statements.at(-1)) : null;
    if (terminal?.kind === "if") {
      const targetIndex = resolveLabelIndex(labelToIndex, terminal.target ?? "");
      if (targetIndex != null && targetIndex > index + 1) {
        const trueTailIndex = lastNonemptyBlockIndex(blocks, index + 1, targetIndex);
        if (trueTailIndex != null) {
          const trueTailTerminal = parseTerminalStatement(blocks[trueTailIndex][1].at(-1));
          if (trueTailTerminal?.kind === "goto") {
            const joinLabel = trueTailTerminal.target ?? "";
            const joinIndex = resolveLabelIndex(labelToIndex, joinLabel);
            if (joinIndex != null && joinIndex > targetIndex && joinIndex <= blocks.length) {
              const trueResult = renderStructuredRegion(blocks, labelToIndex, index + 1, targetIndex, returnLabels, new Set([joinLabel]));
              const falseResult = renderStructuredRegion(blocks, labelToIndex, targetIndex, joinIndex, returnLabels, new Set([joinLabel]));
              if (trueResult && falseResult) {
                lines.push(...statements.slice(0, -1).map((statement) => `  ${statement}`));
                lines.push(`  if (${invertConditionText(terminal.condition)}) {`);
                lines.push(...indentLines(trueResult[0], "    "));
                lines.push("  }");
                if (falseResult[0].length) {
                  if (falseResult[0][0].startsWith("if ")) {
                    lines.push(`  else ${falseResult[0][0]}`);
                    lines.push(...falseResult[0].slice(1).map((line) => (line ? `  ${line}` : "")));
                  } else {
                    lines.push("  else {");
                    lines.push(...indentLines(falseResult[0], "    "));
                    lines.push("  }");
                  }
                }
                lines.push("");
                index = joinIndex;
                continue;
              }
            }
          }
        }
      }
    }

    const selectorChain = renderSelectorChain(blocks, labelToIndex, index, blocks.length, returnLabels);
    if (selectorChain) {
      for (const statement of selectorChain[0]) lines.push(statement ? `  ${statement}` : "");
      lines.push("");
      index = selectorChain[1];
      continue;
    }

    const loopConstruct = renderLoopConstruct(blocks, labelToIndex, index, blocks.length, returnLabels);
    if (loopConstruct) {
      lines.push(...loopConstruct[0].map((line) => (line ? `  ${line}` : "")));
      lines.push("");
      index = loopConstruct[1];
      continue;
    }

    const foreachLoopConstruct = renderForeachLoopConstruct(blocks, labelToIndex, index, blocks.length, returnLabels);
    if (foreachLoopConstruct) {
      lines.push(...foreachLoopConstruct[0].map((line) => (line ? `  ${line}` : "")));
      lines.push("");
      index = foreachLoopConstruct[1];
      continue;
    }

    const infiniteLoopConstruct = renderInfiniteLoopConstruct(blocks, labelToIndex, index, blocks.length, returnLabels);
    if (infiniteLoopConstruct) {
      lines.push(...infiniteLoopConstruct[0].map((line) => (line ? `  ${line}` : "")));
      lines.push("");
      index = infiniteLoopConstruct[1];
      continue;
    }

    lines.push(`  ${label}:`);
    for (const statement of statements) lines.push(`    ${statement}`);
    lines.push("");
    index += 1;
  }
  return lines;
}

function buildIrForEvent(classRow, eventRow, variant, classNameMap) {
  const body = classRow.raw.subarray(eventRow.derivedBodyStart, eventRow.derivedBodyEnd);
  const ops = [];
  let offset = 0;
  let endReason = "body_exhausted";
  let unknownTrailing = Buffer.alloc(0);
  let unsupportedOpcodeName = null;
  const targetClassNames = classNameMap;

  while (offset < body.length) {
    const result = parseOneOp(body, offset, variant, targetClassNames);
    if (result.op) {
      result.op.absolute_body_offset = eventRow.derivedBodyStart + result.op.offset;
      ops.push(result.op);
    }
    if (result.endReason) {
      endReason = result.endReason;
      unknownTrailing = result.endReason === "end_opcode" ? body.subarray(result.nextOffset) : (result.unknownTail ?? Buffer.alloc(0));
      unsupportedOpcodeName = result.unsupportedOpcodeName ?? null;
      offset = result.nextOffset;
      break;
    }
    offset = result.nextOffset;
  }

  let debugSymbols = [];
  let debugSymbolOffset = null;
  const lastRetIndex = [...ops.keys()].reverse().find((index) => ops[index].mnemonic === "ret");
  if ((endReason === "unknown_opcode" || endReason === "unsupported_opcode") && lastRetIndex != null) {
    const retEnd = ops[lastRetIndex].offset + ops[lastRetIndex].raw_bytes.length / 2;
    const debugResult = parseDebugSymbols(body, retEnd);
    if (debugResult) {
      debugSymbols = debugResult.debug_symbols;
      debugSymbolOffset = retEnd;
      endReason = "debug_symbols_then_end";
      unknownTrailing = debugResult.trailing_bytes;
    } else if (retEnd <= body.length && retEnd === body.length - unknownTrailing.length) {
      endReason = "terminal_return_then_trailing_bytes";
    }
  }

  return {
    schema_version: "crusader-usecode-ir-v1-poc",
    class: {
      entry_index: classRow.entryIndex,
      object_index: classRow.objectIndex,
      class_id: classRow.classId,
      class_name: classRow.className,
      raw_code_base_u32: classRow.rawCodeBaseU32,
      code_base_minus_one: classRow.codeBaseMinusOne,
      conservative_event_count: classRow.conservativeEventCount
    },
    event: {
      slot: eventRow.slot,
      event_name_hint: eventRow.eventNameHint,
      raw_event_entry_word: eventRow.rawEventEntryWord,
      raw_code_offset: eventRow.rawCodeOffset,
      derived_body_start: eventRow.derivedBodyStart,
      derived_body_end: eventRow.derivedBodyEnd,
      derived_body_length: eventRow.derivedBodyLength,
      repeated_template_status: ""
    },
    body: {
      end_reason: endReason,
      unsupported_opcode_name: unsupportedOpcodeName,
      raw_body_sha1: sha1(body),
      unknown_trailing_bytes: unknownTrailing.toString("hex"),
      decoded_op_count: ops.length,
      debug_symbol_offset: debugSymbolOffset,
      debug_symbol_count: debugSymbols.length
    },
    ops,
    debug_symbols: debugSymbols,
    field_tags: []
  };
}

function renderPseudocode(ir, shapeCatalog) {
  const slotName = sanitizeIdentifier(ir.event.event_name_hint || `slot_${ir.event.slot.toString(16).padStart(2, "0")}`);
  const lines = [
    `function ${sanitizeIdentifier(String(ir.class.class_name).toLowerCase())}_${slotName}() /* entry=${ir.class.entry_index} class_id=0x${ir.class.class_id.toString(16).padStart(4, "0")} slot=0x${ir.event.slot.toString(16).padStart(2, "0")} */`,
    "{"
  ];

  if (ir.debug_symbols.length) {
    lines.push("  var");
    ir.debug_symbols.forEach((symbol, index) => {
      lines.push(`    ${sanitizeIdentifier(symbol.name)}${index + 1 < ir.debug_symbols.length ? "," : ";"} /* ${symbol.bp_repr} type=0x${symbol.type_id.toString(16).padStart(2, "0")} */`);
    });
    lines.push("");
  }

  const renderedBlocks = decompilePseudocodeBlocks(ir);
  const structured = renderStructuredPseudocode(renderedBlocks);
  if (structured) {
    for (const statement of structured) lines.push(statement ? `  ${statement}` : "");
  } else {
    lines.push(...renderPartiallyStructuredBlocks(renderedBlocks));
  }

  if (ir.body.end_reason === "unsupported_opcode") {
    lines.push(`  /* decompilation stopped at ${ir.body.unsupported_opcode_name ?? "unsupported opcode"} */`);
  }

  lines.push("}");
  return applyShapeCatalogToPseudocode(`${lines.join("\n")}\n`, shapeCatalog);
}

function makeFileNameForEvent(eventRow) {
  const slotHex = eventRow.slot.toString(16).toUpperCase().padStart(2, "0");
  const eventName = sanitizeIdentifier(eventRow.eventNameHint || `slot_${slotHex}`);
  return `slot_${slotHex}_${eventName}.txt`;
}

function computeSourceStamp(filePaths, extraPaths = []) {
  const stampInput = [...new Set([...filePaths, ...extraPaths].filter((filePath) => fs.existsSync(filePath)))]
    .map((filePath) => {
      const stat = fs.statSync(filePath);
      return `${filePath}:${stat.size}:${Math.trunc(stat.mtimeMs)}`;
    })
    .join("|");
  return sha1(Buffer.from(stampInput, "utf8")).slice(0, 16);
}

function resolveUsecodePaths(gameConfig) {
  const directories = [gameConfig.staticDir, ...(gameConfig.fallbackStaticDirs ?? [])];
  const names = [...new Set([gameConfig.usecodeFileName, "EUSECODE.FLX", "JUSECODE.FLX", "USECODE.FLX"].filter(Boolean))];
  for (const name of names) {
    for (const directory of directories) {
      const candidate = path.join(directory, name);
      if (fs.existsSync(candidate)) {
        return [candidate];
      }
    }
  }
  return [];
}

export function getGameUsecodeCacheRoot(gameId) {
  return path.join(USECODE_CACHE_ROOT, gameId);
}

export function getGameUsecodeIndexPath(gameId) {
  return path.join(getGameUsecodeCacheRoot(gameId), "index.json");
}

export function ensureGameUsecodeCache(gameConfig) {
  const sourcePaths = resolveUsecodePaths(gameConfig);
  if (!sourcePaths.length) return null;

  fs.mkdirSync(USECODE_CACHE_ROOT, { recursive: true });
  const cacheRoot = getGameUsecodeCacheRoot(gameConfig.id);
  const stamp = computeSourceStamp(sourcePaths, [USECODE_DECOMPILER_IMPL_PATH, DISASM_OPCODE_TABLE_PATH, ...USECODE_SHAPE_CATALOG_PATHS]);
  const manifestPath = path.join(cacheRoot, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (
        manifest.schemaVersion === USECODE_CACHE_SCHEMA_VERSION
        && manifest.stamp === stamp
        && fs.existsSync(path.join(cacheRoot, "index.json"))
      ) {
        return { cacheRoot, indexPath: path.join(cacheRoot, "index.json"), stamp };
      }
    } catch {
      // rebuild below
    }
  }

  fs.rmSync(cacheRoot, { recursive: true, force: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  const shapeCatalog = loadShapeCatalog(gameConfig.catalogId ?? gameConfig.gameId ?? gameConfig.id);
  const index = { game: gameConfig.id, sources: [] };

  for (const sourcePath of sourcePaths) {
    const buffer = fs.readFileSync(sourcePath);
    const classRows = buildClassRows(buffer);
    const classNameMap = new Map(classRows.map((classRow) => [classRow.classId, classRow.className]));
    const sourceName = path.basename(sourcePath, path.extname(sourcePath));
    const sourceRoot = path.join(cacheRoot, sourceName, "pseudocode");
    fs.mkdirSync(sourceRoot, { recursive: true });
    const files = [];

    for (const classRow of classRows) {
      const classDir = path.join(sourceRoot, sanitizeIdentifier(classRow.className));
      fs.mkdirSync(classDir, { recursive: true });
      for (const eventRow of classRow.eventRows) {
        if (eventRow.derivedBodyStart == null || eventRow.derivedBodyEnd == null) continue;
        const ir = buildIrForEvent(classRow, eventRow, String(gameConfig.gameId || gameConfig.catalogId || gameConfig.id).startsWith("regret") ? "regret" : "remorse", classNameMap);
        const pseudocode = renderPseudocode(ir, shapeCatalog);
        const fileName = makeFileNameForEvent(eventRow);
        const outPath = path.join(classDir, fileName);
        fs.writeFileSync(outPath, pseudocode, "utf8");
        files.push({
          className: classRow.className,
          rel: `${sanitizeIdentifier(classRow.className)}/${fileName}`,
          name: fileName,
          path: `${sourceName}/pseudocode/${sanitizeIdentifier(classRow.className)}/${fileName}`,
          slot: eventRow.slot,
          eventNameHint: eventRow.eventNameHint
        });
      }
    }

    files.sort((left, right) => left.className.localeCompare(right.className) || left.rel.localeCompare(right.rel));
    index.sources.push({ id: sourceName, label: sourceName, files });
  }

  fs.writeFileSync(path.join(cacheRoot, "index.json"), JSON.stringify(index, null, 2), "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: USECODE_CACHE_SCHEMA_VERSION, stamp, sources: sourcePaths }, null, 2), "utf8");
  return { cacheRoot, indexPath: path.join(cacheRoot, "index.json"), stamp };
}

export default {
  parseFlxTable,
  ensureGameUsecodeCache,
  getGameUsecodeCacheRoot,
  getGameUsecodeIndexPath
};
