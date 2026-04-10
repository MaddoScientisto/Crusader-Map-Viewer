import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const USECODE_UNK_EXPORTER_IMPL_PATH = fileURLToPath(import.meta.url);

const DEBUGGER_SAFE_NEWLINE = "\r\n";
const MAX_DEBUGGER_SOURCE_LINES = 5999;
const MISSING_DEBUG_LINE_PLACEHOLDER = "//";
const LOW_SIGNAL_PREFIXES = ["push_"];
const LOW_SIGNAL_MNEMONICS = new Set([
  "add_sp",
  "copy_string",
  "dword_to_word",
  "init",
  "line_number",
  "ptr_to_string",
  "str_to_ptr",
  "symbol_info",
  "word_to_dword"
]);

function signedByte(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function sanitizeIdentifier(name) {
  const cleaned = String(name ?? "")
    .trim()
    .split("")
    .map((char) => (/[A-Za-z0-9_]/u.test(char) ? char : "_"))
    .join("")
    .replace(/^_+|_+$/gu, "");
  if (!cleaned) {
    return "var";
  }
  return /^\d/u.test(cleaned) ? `v_${cleaned}` : cleaned;
}

function formatScriptString(value) {
  return `"${String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function formatGlobalReference(globalId) {
  return `global[0x${globalId.toString(16).padStart(4, "0")}]`;
}

function safeUnitName(name) {
  const filtered = String(name ?? "")
    .trim()
    .toUpperCase()
    .split("")
    .filter((char) => /[A-Z0-9_]/u.test(char))
    .join("");
  if (!filtered) {
    return "UNKNOWN";
  }
  return filtered.slice(0, 8);
}

function truncateSummary(text, limit = 96) {
  const normalized = String(text ?? "").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function buildLocalNameMap(ir) {
  return new Map((ir.debug_symbols ?? []).map((symbol) => [symbol.bp_offset, sanitizeIdentifier(symbol.name)]));
}

function formatBpName(bpOffset, localNameMap) {
  if (localNameMap.has(bpOffset)) {
    return localNameMap.get(bpOffset);
  }
  const disp = signedByte(bpOffset);
  return disp >= 0 ? `arg_${String(disp).padStart(2, "0")}` : `local_${String(Math.abs(disp)).padStart(2, "0")}`;
}

function intrinsicDisplayName(nameHint, ordinal) {
  if (!nameHint) {
    return `intrinsic_${ordinal.toString(16).padStart(4, "0")}`;
  }
  let display = String(nameHint).replaceAll("::", ".");
  display = display.replace(/(?<=\.)I_/u, "").replace(/^I_/u, "");
  const paren = display.indexOf("(");
  return paren >= 0 ? display.slice(0, paren) : display;
}

function targetEventDisplayName(operands) {
  if (operands.target_event_name_hint) {
    return sanitizeIdentifier(operands.target_event_name_hint);
  }
  return `slot_${operands.target_event_slot.toString(16).padStart(2, "0")}`;
}

function formatTargetEventReference(operands) {
  const className = operands.target_class_name_hint
    ? sanitizeIdentifier(operands.target_class_name_hint)
    : `class_${operands.target_class_id.toString(16).padStart(4, "0")}`;
  return `${className}.${targetEventDisplayName(operands)}`;
}

function summarizeOperands(op, localNameMap) {
  const operands = op.operands ?? {};
  switch (op.mnemonic) {
    case "push_local_byte":
    case "push_local_word":
    case "push_local_dword":
    case "push_local_string":
    case "push_local_slist":
    case "push_local_addr":
    case "push_string_ptr":
    case "pop_local_byte":
    case "pop_local_word":
    case "pop_local_dword":
    case "free_local_string":
    case "free_local_slist":
    case "free_local_list":
      return formatBpName(operands.bp_offset, localNameMap);
    case "push_member_byte":
    case "push_member_word":
    case "push_member_dword":
    case "push_member_huge":
    case "pop_member_byte":
    case "pop_member_word":
    case "pop_member_dword":
    case "pop_member_blob":
      return `member.${formatBpName(operands.bp_offset, localNameMap)}`;
    case "push_byte_immediate":
      return String(operands.value_signed);
    case "push_word_immediate":
      return `0x${operands.value_u16.toString(16).padStart(4, "0")}`;
    case "push_dword_immediate":
      return `0x${operands.value_u32.toString(16).padStart(8, "0")}`;
    case "push_string_immediate":
      return truncateSummary(formatScriptString(operands.string), 48);
    case "push_global":
    case "pop_global":
    case "global_address":
      return formatGlobalReference(operands.global_id);
    case "call_intrinsic":
      return `${intrinsicDisplayName(operands.intrinsic_name_hint, operands.intrinsic_ordinal)}(arg_bytes=0x${operands.arg_bytes.toString(16)})`;
    case "call_class_event":
    case "spawn":
    case "spawn_inline":
      return formatTargetEventReference(operands);
    case "jne":
    case "jmp":
    case "foreach_list":
    case "foreach_slist":
      return `0x${operands.target_offset.toString(16).padStart(4, "0")}`;
    case "push_global_address":
      return formatGlobalReference(operands.global_id);
    default:
      break;
  }

  const entries = [];
  for (const [key, value] of Object.entries(operands)) {
    if (value == null) {
      continue;
    }
    if (typeof value === "number") {
      entries.push(`${key}=0x${value.toString(16)}`);
      continue;
    }
    entries.push(`${key}=${truncateSummary(value, 32)}`);
  }
  return entries.join(", ");
}

function formatOpSummary(op, localNameMap) {
  const summary = summarizeOperands(op, localNameMap);
  return truncateSummary(summary ? `${op.mnemonic} ${summary}` : op.mnemonic);
}

function groupOpsByDebugLine(ir) {
  const grouped = new Map();
  const seenLines = [];
  let currentLine = null;

  for (const op of ir.ops ?? []) {
    if (op.mnemonic === "line_number") {
      currentLine = op.operands?.line_number ?? null;
      if (currentLine != null && !grouped.has(currentLine)) {
        grouped.set(currentLine, []);
        seenLines.push(currentLine);
      }
      continue;
    }
    if (currentLine == null) {
      continue;
    }
    grouped.get(currentLine).push(op);
  }

  return { grouped, debugLines: seenLines.sort((left, right) => left - right) };
}

function summarizeDebugLine(ir, ops) {
  const localNameMap = buildLocalNameMap(ir);
  const filteredOps = ops.filter((op) => !LOW_SIGNAL_MNEMONICS.has(op.mnemonic));
  const rendered = filteredOps.map((op) => formatOpSummary(op, localNameMap)).filter(Boolean);
  const preferred = rendered.filter((_, index) => !filteredOps[index].mnemonic.startsWith(LOW_SIGNAL_PREFIXES[0]));
  const selected = (preferred.length ? preferred : rendered).slice(0, 3);
  if (!selected.length) {
    return "";
  }
  const summary = selected.join(" ; ");
  return rendered.length > 3 ? `${summary} ; ...` : summary;
}

function buildSparseLinesForEvent(ir) {
  const { grouped, debugLines } = groupOpsByDebugLine(ir);
  const sparseLines = new Map();
  for (const lineNumber of debugLines) {
    const slot = ir.event.slot;
    const slotName = ir.event.event_name_hint || `slot_${slot.toString(16).padStart(2, "0")}`;
    const prefix = `[${slot.toString(16).toUpperCase().padStart(2, "0")}:${slotName}]`;
    const summary = summarizeDebugLine(ir, grouped.get(lineNumber) ?? []);
    sparseLines.set(lineNumber, `${prefix} ${summary}`.trimEnd());
  }
  return { sparseLines, debugLineCount: debugLines.length };
}

function renderPseudocodeAppendix(className, events, hasSparsePrefix) {
  const lines = [
    ...(hasSparsePrefix ? [""] : []),
    `/* synthesized appendix for ${className} */`,
    "/* sparse lines above preserve recovered debugger line numbers where available */"
  ];

  for (const event of [...events].sort((left, right) => left.ir.event.slot - right.ir.event.slot)) {
    const slot = event.ir.event.slot;
    const slotName = event.ir.event.event_name_hint || `slot_${slot.toString(16).padStart(2, "0")}`;
    lines.push("", `/* ===== slot 0x${slot.toString(16).padStart(2, "0")} ${slotName} ===== */`);
    lines.push(...String(event.pseudocode ?? "").trimEnd().split(/\r?\n/u));
  }

  lines.push("");
  return lines;
}

function buildPlaceholderLine(lineNumber, useDenseNumbering) {
  if (!useDenseNumbering) {
    return MISSING_DEBUG_LINE_PLACEHOLDER;
  }
  return `// ${String(lineNumber).padStart(4, "0")}`;
}

export function buildUnkExportForClass({ className, entryIndex, events, fallbackDenseLineCount = 0 }) {
  const sparseMap = new Map();
  let debugLineCount = 0;
  let collisionCount = 0;

  for (const event of events) {
    const { sparseLines, debugLineCount: eventDebugLineCount } = buildSparseLinesForEvent(event.ir);
    debugLineCount += eventDebugLineCount;
    for (const [lineNumber, content] of sparseLines.entries()) {
      const existing = sparseMap.get(lineNumber) ?? [];
      if (existing.length) {
        collisionCount += 1;
      }
      existing.push(content);
      sparseMap.set(lineNumber, existing);
    }
  }

  const appendixLines = renderPseudocodeAppendix(className, events, sparseMap.size > 0);
  const maxRecoveredLine = sparseMap.size ? Math.max(...sparseMap.keys()) : 0;
  const requestedLineTableCount = Math.max(maxRecoveredLine, fallbackDenseLineCount);
  const lineTableCount = Math.min(requestedLineTableCount, Math.max(0, MAX_DEBUGGER_SOURCE_LINES - appendixLines.length));
  const useDenseNumbering = sparseMap.size === 0 && lineTableCount > 0;
  const outputLines = Array.from(
    { length: lineTableCount },
    (_, index) => buildPlaceholderLine(index + 1, useDenseNumbering)
  );
  for (const lineNumber of [...sparseMap.keys()].sort((left, right) => left - right)) {
    if (lineNumber <= outputLines.length) {
      outputLines[lineNumber - 1] = sparseMap.get(lineNumber).join(" || ");
    }
  }
  outputLines.push(...appendixLines);

  let lineTableMode = "appendix_only";
  if (sparseMap.size > 0) {
    lineTableMode = "recovered";
  } else if (lineTableCount > 0) {
    lineTableMode = "synthetic_floor";
  }

  return {
    fileName: `${safeUnitName(className)}.unk`,
    text: `${outputLines.join(DEBUGGER_SAFE_NEWLINE).replace(/(?:\r?\n)*$/u, "")}${DEBUGGER_SAFE_NEWLINE}`,
    manifestRow: {
      class_name: className,
      entry_index: entryIndex,
      body_count: events.length,
      debug_line_count: debugLineCount,
      mapped_line_count: sparseMap.size,
      collision_count: collisionCount,
      line_table_mode: lineTableMode,
      line_table_count: lineTableCount
    }
  };
}

export function writeUnkManifest(manifestPath, rows) {
  const lines = [
    [
      "class_name",
      "entry_index",
      "body_count",
      "debug_line_count",
      "mapped_line_count",
      "collision_count",
      "line_table_mode",
      "line_table_count",
      "output_path"
    ].join("\t")
  ];

  for (const row of rows) {
    lines.push([
      row.class_name,
      row.entry_index,
      row.body_count,
      row.debug_line_count,
      row.mapped_line_count,
      row.collision_count,
      row.line_table_mode,
      row.line_table_count,
      row.output_path
    ].join("\t"));
  }

  fs.writeFileSync(manifestPath, `${lines.join("\n")}\n`, "utf8");
}