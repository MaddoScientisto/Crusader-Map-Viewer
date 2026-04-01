import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { __testHooks } from "../src/lib/usecode-decompiler.js";

function makeIr(ops, debugSymbols = []) {
  return {
    class: {
      entry_index: 0,
      class_id: 0,
      class_name: "TEST"
    },
    event: {
      derived_body_start: 0,
      slot: 0
    },
    body: {
      end_reason: "end_opcode"
    },
    debug_symbols: debugSymbols,
    ops
  };
}

function op(absoluteBodyOffset, mnemonic, operands = {}) {
  return {
    absolute_body_offset: absoluteBodyOffset,
    mnemonic,
    operands
  };
}

function renderStructured(ir) {
  const blocks = __testHooks.decompilePseudocodeBlocks(ir);
  const structured = __testHooks.renderStructuredPseudocode(blocks);
  assert.ok(structured, "expected structured pseudocode output");
  return structured.join("\n");
}

function renderPseudo(ir) {
  return __testHooks.renderPseudocode(ir, new Map());
}

function testImportedIntrinsicTablesResolveKnownOrdinals() {
  assert.equal(__testHooks.getIntrinsicNameHint("remorse", 0x003c, 2), "Item::getItemFamily(Item *)");
  assert.equal(__testHooks.getIntrinsicNameHint("remorse", 0x0057, 2), "Item::getSurfaceWeight(Item *)");
  assert.ok(__testHooks.getIntrinsicNameHint("regret", 0x0107, 2), "expected a regret-specific high ordinal hint");
  assert.doesNotMatch(__testHooks.getIntrinsicNameHint("regret", 0x0107, 2), /^Intrinsic/u);
}

function testSelectorLadderUsesEqualityCompareAndFalseBranch() {
  const text = renderStructured(
    makeIr(
      [
        op(0, "push_local_word", { bp_offset: 0xfe }),
        op(1, "push_word_immediate", { value_u16: 0 }),
        op(2, "cmp", {}),
        op(3, "jne", { target_offset: 6 }),
        op(4, "push_word_immediate", { value_u16: 1 }),
        op(5, "pop_local_word", { bp_offset: 0xfc }),
        op(6, "ret", {})
      ],
      [
        { bp_offset: 0xfe, name: "dir" },
        { bp_offset: 0xfc, name: "x" }
      ]
    )
  );

  assert.match(text, /if \(dir == 0x0000\) \{/u);
  assert.doesNotMatch(text, /if \(dir != 0x0000\) \{/u);
}

function testCountedLoopRendersWithContinueCondition() {
  const text = renderStructured(
    makeIr(
      [
        op(0, "push_local_word", { bp_offset: 0xfe }),
        op(1, "push_word_immediate", { value_u16: 7 }),
        op(2, "le", {}),
        op(3, "jne", { target_offset: 9 }),
        op(4, "push_local_word", { bp_offset: 0xfe }),
        op(5, "push_word_immediate", { value_u16: 1 }),
        op(6, "add", {}),
        op(7, "pop_local_word", { bp_offset: 0xfe }),
        op(8, "jmp", { target_offset: 0 }),
        op(9, "ret", {})
      ],
      [
        { bp_offset: 0xfe, name: "counter" }
      ]
    )
  );

  assert.match(text, /while \(counter <= 0x0007\) \{/u);
  assert.doesNotMatch(text, /while \(counter > 0x0007\) \{/u);
}

function testAlarmhatStyleSelectorLoopStructuring() {
  const structured = __testHooks.renderStructuredPseudocode([
    ["entry", ["set_info(0x0211, *(arg_06));", "process_exclude();", "if Item.getFrame(arg_06) goto block_0156;"]],
    ["block_00fa_selector_00", ["/* loop_selector item in nearby_items(shape=NPC_SPAWNER_04D0, origin=arg_06) */"]],
    ["block_0103", ["if condition goto block_0151;"]],
    ["block_0106", ["if (Item.getFrame(item) != 0) goto block_014d;", "suspend;"]],
    ["block_014d", ["/* loopnext */", "goto block_0103;"]],
    ["block_0151", ["goto block_0233;"]],
    ["block_0156", ["if !Item.isOnScreen(arg_06) goto block_0233;"]],
    ["block_0233", ["return;"]]
  ]);

  assert.ok(structured, "expected alarmhat-style loop to structure");
  const text = structured.join("\n");
  assert.match(text, /if \(!Item.getFrame\(arg_06\)\) \{/u);
  assert.match(text, /for item in nearby_items\(shape=NPC_SPAWNER_04D0, origin=arg_06\) \{/u);
  assert.doesNotMatch(text, /block_00fa_selector_00:/u);
  assert.doesNotMatch(text, /goto block_0233;/u);
}

function testLoopTailKeepsOuterExitLabels() {
  const structured = __testHooks.renderStructuredPseudocode([
    ["entry", ["if !(1) goto block_exit;"]],
    ["block_body", ["work();"]],
    ["block_cmp", ["if newLink != baseLink goto block_update;"]],
    ["block_break", ["goto block_exit;"]],
    ["block_update", ["baseLink = newLink;", "goto entry;"]],
    ["block_exit", ["return;"]]
  ]);

  assert.ok(structured, "expected loop tail to remain structured");
  const text = structured.join("\n");
  assert.match(text, /while \(1\) \{/u);
  assert.match(text, /baseLink = newLink;/u);
  assert.doesNotMatch(text, /block_update:/u);
  assert.doesNotMatch(text, /goto entry;/u);
}

function testForeachLoopStructuring() {
  const structured = __testHooks.renderStructuredPseudocode([
    ["entry", ["foreach_list item -> block_exit;"]],
    ["block_body", ["spawn TRIGGER.slot_21(pid, item, arg_06);", "suspend;", "goto entry;"]],
    ["block_exit", ["return;"]]
  ]);

  assert.ok(structured, "expected foreach loop to structure");
  const text = structured.join("\n");
  assert.match(text, /while \(true\) \{/u);
  assert.match(text, /foreach_list item -> block_exit;/u);
  assert.doesNotMatch(text, /goto entry;/u);
}

function testCommentPrefixedReturnLabelCountsAsReturn() {
  const structured = __testHooks.renderStructuredPseudocode([
    ["entry", ["if ready goto block_work;"]],
    ["block_cleanup", ["goto block_exit;"]],
    ["block_work", ["work();"]],
    ["block_exit", ["/* free_local_list */", "return;"]]
  ]);

  assert.ok(structured, "expected cleanup+return label to structure as a return exit");
  const text = structured.join("\n");
  assert.doesNotMatch(text, /goto block_exit;/u);
}

function testCleanupOpsStayHiddenInPseudocode() {
  const text = renderPseudo(
    makeIr([
      op(0, "push_pid", {}),
      op(1, "push_string_immediate", { declared_length: 2, string: "1c" }),
      op(2, "push_dword_immediate", { value_u32: 0 }),
      op(3, "spawn", { target_class_id: 0, target_event_slot: 0x26, target_event_name_hint: null, target_class_name_hint: "FREE" }),
      op(4, "free_stack_string", { value_u8: 2 }),
      op(5, "push_global", { global_id: 0x003c, size: 2 }),
      op(6, "pop_global", { global_id: 0x003c, size: 2 }),
      op(7, "ret", {})
    ])
  );

  assert.match(text, /spawn FREE\.slot_26\(pid, "1c", 0x00000000\);/u);
  assert.doesNotMatch(text, /free_stack_string/u);
  assert.doesNotMatch(text, /pop_global/u);
}

function testWidthShimOpsStayHiddenInAssignmentsAndDiscards() {
  const text = renderPseudo(
    makeIr(
      [
        op(0, "push_pid", {}),
        op(1, "push_word_immediate", { value_u16: 2 }),
        op(2, "push_dword_immediate", { value_u32: 0 }),
        op(3, "spawn", { target_class_id: 0, target_event_slot: 0x21, target_event_name_hint: null, target_class_name_hint: "TRIGGER" }),
        op(4, "push_process_result", {}),
        op(5, "dword_to_word", {}),
        op(6, "pop_local_word", { bp_offset: 0xfe }),
        op(7, "push_word_immediate", { value_u16: 1 }),
        op(8, "call_intrinsic", { intrinsic_ordinal: 0x0011, arg_bytes: 2, intrinsic_name_hint: "Item::getType(void)" }),
        op(9, "word_to_dword", {}),
        op(10, "pop_result", {}),
        op(11, "ret", {})
      ],
      [
        { bp_offset: 0xfe, bp_repr: "BP-02h", name: "baseLink", type_id: 0x69 }
      ]
    )
  );

  assert.match(text, /baseLink = process_result;/u);
  assert.match(text, /Item\.getType\(0x0001\);/u);
  assert.match(text, /process_result = value;/u);
  assert.doesNotMatch(text, /dword_to_word/u);
  assert.doesNotMatch(text, /word_to_dword/u);
  assert.doesNotMatch(text, /pop_result/u);
}

function testUnaryAndConcatOpsRenderAsExpressions() {
  const text = renderPseudo(
    makeIr(
      [
        op(0, "push_local_string", { bp_offset: 0xfe }),
        op(1, "push_string_immediate", { declared_length: 5, string: "tail" }),
        op(2, "concat", {}),
        op(3, "pop_local_word", { bp_offset: 0xfe }),
        op(4, "push_local_word", { bp_offset: 0xfc }),
        op(5, "bit_not", {}),
        op(6, "pop_local_word", { bp_offset: 0xfc }),
        op(7, "ret", {})
      ],
      [
        { bp_offset: 0xfe, bp_repr: "BP-02h", name: "textFile", type_id: 0x73 },
        { bp_offset: 0xfc, bp_repr: "BP-04h", name: "flags", type_id: 0x69 }
      ]
    )
  );

  assert.match(text, /textFile = \(textFile \+ "tail"\);/u);
  assert.match(text, /flags = \(~flags\);/u);
  assert.doesNotMatch(text, /concat/u);
  assert.doesNotMatch(text, /bit_not/u);
}

function testUndecodedLoopSetupStaysHidden() {
  const text = renderPseudo(
    makeIr([
      op(0, "loopscr", { value_u8: 0x24 }),
      op(1, "loopscr", { value_u8: 0x3d }),
      op(2, "loop", { current_var: 0xfe, string_bytes: 0, loop_type: 0 }),
      op(3, "ret", {})
    ])
  );

  assert.doesNotMatch(text, /loopscr/u);
  assert.doesNotMatch(text, /\bloop\b/u);
}

function testShiftAndStringCompareOpsRenderAsExpressions() {
  const text = renderPseudo(
    makeIr(
      [
        op(0, "push_local_word", { bp_offset: 0xfe }),
        op(1, "push_word_immediate", { value_u16: 8 }),
        op(2, "rsh", {}),
        op(3, "pop_local_word", { bp_offset: 0xfc }),
        op(4, "ret", {})
      ],
      [
        { bp_offset: 0xfe, bp_repr: "BP-02h", name: "rand", type_id: 0x69 },
        { bp_offset: 0xfc, bp_repr: "BP-04h", name: "highByte", type_id: 0x69 }
      ]
    )
  );

  assert.match(text, /highByte = \(rand >> 0x0008\);/u);
  assert.doesNotMatch(text, /\brsh\b/u);
}

function testStringCompareOpsRenderAsExpressions() {
  const text = renderPseudo(
    makeIr(
      [
        op(0, "push_local_string", { bp_offset: 0xfe }),
        op(1, "push_string_immediate", { declared_length: 1, string: "" }),
        op(2, "strcmp", {}),
        op(3, "pop_local_word", { bp_offset: 0xfc }),
        op(4, "ret", {})
      ],
      [
        { bp_offset: 0xfe, bp_repr: "BP-02h", name: "textFile", type_id: 0x73 },
        { bp_offset: 0xfc, bp_repr: "BP-04h", name: "matches", type_id: 0x69 }
      ]
    )
  );

  assert.match(text, /matches = \(strcmp\(textFile, ""\) == 0\);/u);
  assert.doesNotMatch(text, /strcmp \*\//u);
}

function testCreateListAndAppendListRenderAsListExpressions() {
  const text = renderPseudo(
    makeIr(
      [
        op(0, "push_local_word", { bp_offset: 0xfc }),
        op(1, "push_local_word", { bp_offset: 0xfa }),
        op(2, "create_list", { element_size: 2, count: 1 }),
        op(3, "append_list", {}),
        op(4, "pop_local_word", { bp_offset: 0xfe }),
        op(5, "ret", {})
      ],
      [
        { bp_offset: 0xfe, bp_repr: "BP-02h", name: "list", type_id: 0x7a },
        { bp_offset: 0xfc, bp_repr: "BP-04h", name: "existing", type_id: 0x7a },
        { bp_offset: 0xfa, bp_repr: "BP-06h", name: "line", type_id: 0x73 }
      ]
    )
  );

  assert.match(text, /list = \(existing \+ \[line\]\);/u);
  assert.doesNotMatch(text, /\/\* create_list \*\//u);
  assert.doesNotMatch(text, /\/\* append_list \*\//u);
}

function testCompoundFalseBranchStaysNegated() {
  const blocks = __testHooks.decompilePseudocodeBlocks(
    makeIr(
      [
        op(0, "push_local_word", { bp_offset: 0xfe }),
        op(1, "push_word_immediate", { value_u16: 1 }),
        op(2, "cmp", {}),
        op(3, "push_local_word", { bp_offset: 0xfe }),
        op(4, "push_word_immediate", { value_u16: 2 }),
        op(5, "cmp", {}),
        op(6, "or", {}),
        op(7, "jne", { target_offset: 10 }),
        op(8, "ret", {}),
        op(10, "ret", {})
      ],
      [
        { bp_offset: 0xfe, bp_repr: "BP-02h", name: "mode", type_id: 0x69 }
      ]
    )
  );

  const entryLine = blocks[0][1].at(-1);
  assert.match(entryLine, /if !\(\(mode == 0x0001\) \|\| \(mode == 0x0002\)\) goto /u);
  assert.doesNotMatch(entryLine, /mode != 0x0001/u);
}

function testShapeWhitelistSelectorLoopRendersAsNearbyItems() {
  const blocks = __testHooks.decompilePseudocodeBlocks(
    makeIr([
      op(0, "loopscr", { value_u8: 0x24 }),
      op(1, "push_word_immediate", { value_u16: 0x03a7 }),
      op(2, "push_word_immediate", { value_u16: 0x03a8 }),
      op(3, "push_word_immediate", { value_u16: 0x021a }),
      op(4, "loopscr", { value_u8: 0x4c }),
      op(5, "push_byte_immediate", { value_signed: 100, value_u8: 100 }),
      op(6, "push_byte_immediate", { value_signed: 32, value_u8: 32 }),
      op(7, "mul", {}),
      op(8, "push_local_dword", { bp_offset: 0x06 }),
      op(9, "push_indirect", { size: 2 }),
      op(10, "loop", { current_var: 0xfe, string_bytes: 0x06, loop_type: 0x02 }),
      op(11, "ret", {})
    ])
  );
  const text = JSON.stringify(blocks);

  assert.match(text, /nearby_items\(shapes=\[0x03a7, 0x03a8, 0x021a\], distance=\(100 \* 32\), origin=arg_06\)/u);
  assert.doesNotMatch(text, /selector_0x42/u);
}

function testSelectorChainRendersAsSwitch() {
  const structured = __testHooks.renderStructuredPseudocode([
    ["entry", ["if selector != 1 goto block_0004;"]],
    ["block_0002", ["foo();", "goto block_000a;"]],
    ["block_0004", ["if selector != 2 goto block_0008;"]],
    ["block_0006", ["bar();", "goto block_000a;"]],
    ["block_0008", ["if selector != 3 goto block_000a;"]],
    ["block_0009", ["baz();", "goto block_000a;"]],
    ["block_000a", ["return;"]]
  ]);

  assert.ok(structured, "expected selector chain to structure as a switch");
  const text = structured.join("\n");
  assert.match(text, /switch \(selector\) \{/u);
  assert.match(text, /case 1:/u);
  assert.match(text, /case 2:/u);
  assert.match(text, /case 3:/u);
}

function testRegionEndGotoCountsAsStructuredExit() {
  const structured = __testHooks.renderStructuredPseudocode([
    ["entry", ["if !condition goto block_exit;"]],
    ["block_body", ["step();", "goto block_exit;"]],
    ["block_tail", ["goto entry;"]],
    ["block_exit", ["return;"]]
  ]);

  assert.ok(structured, "expected region-end goto to count as a structured exit");
  const text = structured.join("\n");
  assert.match(text, /while \(condition\) \{/u);
  assert.doesNotMatch(text, /goto block_exit;/u);
}

function testRealTriggerSlot20NoLongerFallsBackToBlocks() {
  const usecodePath = path.resolve("STATIC", "EUSECODE.FLX");
  const buffer = fs.readFileSync(usecodePath);
  const classRows = __testHooks.buildClassRows(buffer);
  const classRow = classRows.find((row) => row.className === "TRIGGER");
  assert.ok(classRow, "expected TRIGGER class in remorse EUSECODE");

  const eventRow = classRow.eventRows.find((row) => row.slot === 0x20);
  assert.ok(eventRow, "expected TRIGGER slot 0x20 body");

  const classNameMap = new Map(classRows.map((row) => [row.classId, row.className]));
  const ir = __testHooks.buildIrForEvent(classRow, eventRow, "remorse", classNameMap);
  const text = __testHooks.renderPseudocode(ir, new Map());

  assert.match(text, /for item in nearby_items\(shape=0x04b1, origin=aitem\) \{/u);
  assert.doesNotMatch(text, /^\s*(?:entry|block_[0-9a-f]+):/imu);
  assert.doesNotMatch(text, /goto block_/iu);
}

function testRealBlastpacUseNoLongerFallsBackToBlocks() {
  const usecodePath = path.resolve("STATIC", "EUSECODE.FLX");
  const buffer = fs.readFileSync(usecodePath);
  const classRows = __testHooks.buildClassRows(buffer);
  const classRow = classRows.find((row) => row.className === "BLASTPAC");
  assert.ok(classRow, "expected BLASTPAC class in remorse EUSECODE");

  const eventRow = classRow.eventRows.find((row) => row.slot === 0x01);
  assert.ok(eventRow, "expected BLASTPAC slot 0x01 body");

  const classNameMap = new Map(classRows.map((row) => [row.classId, row.className]));
  const ir = __testHooks.buildIrForEvent(classRow, eventRow, "remorse", classNameMap);
  const text = __testHooks.renderPseudocode(ir, new Map());

  assert.match(text, /for item in nearby_items\(shape=0x053a, origin=global\[0x003c\]\) \{/iu);
  assert.doesNotMatch(text, /^\s*(?:entry|block_[0-9a-f]+):/imu);
  assert.doesNotMatch(text, /goto block_/iu);
}

function testRealRegretBridgeSlot22KeepsSideEffectsAndProcessResult() {
  const usecodePath = path.resolve("STATIC_REGRET", "EUSECODE.FLX");
  const buffer = fs.readFileSync(usecodePath);
  const classRows = __testHooks.buildClassRows(buffer);
  const classRow = classRows.find((row) => row.className === "BRIDGE");
  assert.ok(classRow, "expected BRIDGE class in regret EUSECODE");

  const eventRow = classRow.eventRows.find((row) => row.slot === 0x22);
  assert.ok(eventRow, "expected BRIDGE slot 0x22 body");

  const classNameMap = new Map(classRows.map((row) => [row.classId, row.className]));
  const ir = __testHooks.buildIrForEvent(classRow, eventRow, "regret", classNameMap);
  const text = __testHooks.renderPseudocode(ir, new Map());

  assert.match(text, /local_04 = Item\.getQLo\(local_02\);/u);
  assert.match(text, /Item\.playSfxCru\(0x0099, arg_06\);/u);
  assert.match(text, /process_result = 1;/u);
  assert.match(text, /process_result = 0;/u);
}

function testRealRegretChangerHatchRendersRoofSelector() {
  const usecodePath = path.resolve("STATIC_REGRET", "EUSECODE.FLX");
  const buffer = fs.readFileSync(usecodePath);
  const classRows = __testHooks.buildClassRows(buffer);
  const classRow = classRows.find((row) => row.className === "CHANGER");
  assert.ok(classRow, "expected CHANGER class in regret EUSECODE");

  const eventRow = classRow.eventRows.find((row) => row.slot === 0x07);
  assert.ok(eventRow, "expected CHANGER slot 0x07 body");

  const classNameMap = new Map(classRows.map((row) => [row.classId, row.className]));
  const ir = __testHooks.buildIrForEvent(classRow, eventRow, "regret", classNameMap);
  const text = __testHooks.renderPseudocode(ir, new Map());

  assert.match(text, /for local_02 in nearby_items\(shapes=\[0x03a7, 0x03a8, 0x021a, 0x012e, 0x04df, 0x051c, 0x051b, 0x0639, 0x063a, 0x063b, 0x063c, 0x063d\], distance=\(100 \* 32\), origin=arg_06\) \{/u);
  assert.match(text, /if \(local_06 == local_08\) \{/u);
  assert.doesNotMatch(text, /while \(condition\)/u);
}

function testRealBroBootEquipRendersSwitch() {
  const usecodePath = path.resolve("STATIC", "EUSECODE.FLX");
  const buffer = fs.readFileSync(usecodePath);
  const classRows = __testHooks.buildClassRows(buffer);
  const classRow = classRows.find((row) => row.className === "BRO_BOOT");
  assert.ok(classRow, "expected BRO_BOOT class in remorse EUSECODE");

  const eventRow = classRow.eventRows.find((row) => row.slot === 0x0a);
  assert.ok(eventRow, "expected BRO_BOOT slot 0x0a body");

  const classNameMap = new Map(classRows.map((row) => [row.classId, row.className]));
  const ir = __testHooks.buildIrForEvent(classRow, eventRow, "remorse", classNameMap);
  const text = __testHooks.renderPseudocode(ir, new Map());

  assert.match(text, /switch \(global\[0x001f\]\) \{/u);
  assert.match(text, /case 2:/u);
  assert.match(text, /case 10:/u);
}

function testRealBroBootEnterFastAreaNoLongerFallsBackToBlocks() {
  const usecodePath = path.resolve("STATIC", "EUSECODE.FLX");
  const buffer = fs.readFileSync(usecodePath);
  const classRows = __testHooks.buildClassRows(buffer);
  const classRow = classRows.find((row) => row.className === "BRO_BOOT");
  assert.ok(classRow, "expected BRO_BOOT class in remorse EUSECODE");

  const eventRow = classRow.eventRows.find((row) => row.slot === 0x0f);
  assert.ok(eventRow, "expected BRO_BOOT slot 0x0f body");

  const classNameMap = new Map(classRows.map((row) => [row.classId, row.className]));
  const ir = __testHooks.buildIrForEvent(classRow, eventRow, "remorse", classNameMap);
  const text = __testHooks.renderPseudocode(ir, new Map());

  assert.match(text, /if \([\s\S]*global\[0x001f\] == 2[\s\S]*\|\|[\s\S]*global\[0x001f\] == 3/u);
  assert.match(text, /Item\.setFrame\(0, arg_06\);/u);
  assert.match(text, /Item\.setFrame\(10, arg_06\);/u);
  assert.match(text, /while \(true\) \{/u);
  assert.doesNotMatch(text, /^\s*(?:entry|block_[0-9a-f]+):/imu);
  assert.doesNotMatch(text, /goto block_/iu);
  assert.doesNotMatch(text, /global\[0x001f\] != 2/u);
}

function testGlobalAddressFeedsIntrinsicsAndLoopnextStaysHidden() {
  const text = renderPseudo(
    makeIr([
      op(0, "global_address", { global_id: 0x003c }),
      op(1, "push_indirect", { size: 2 }),
      op(2, "call_intrinsic", { intrinsic_ordinal: 0x0011, arg_bytes: 2, intrinsic_name_hint: "Item::getType(void)" }),
      op(3, "push_retval_word", {}),
      op(4, "push_word_immediate", { value_u16: 40 }),
      op(5, "cmp", {}),
      op(6, "jne", { target_offset: 10 }),
      op(7, "loopnext", {}),
      op(8, "suspend", {}),
      op(9, "ret", {})
    ])
  );

  assert.match(text, /Item\.getType\(global\[0x003c\]\)/u);
  assert.doesNotMatch(text, /loopnext/u);
}

function testNamedIntrinsic003cRendersAsItemFamily() {
  const text = renderPseudo(
    makeIr([
      op(0, "push_local_word", { bp_offset: 0xfe }),
      op(1, "call_intrinsic", { intrinsic_ordinal: 0x003c, arg_bytes: 2, intrinsic_name_hint: "Item::getItemFamily(void)" }),
      op(2, "push_retval_word", {}),
      op(3, "push_word_immediate", { value_u16: 10 }),
      op(4, "cmp", {}),
      op(5, "jne", { target_offset: 7 }),
      op(6, "ret", {}),
      op(7, "ret", {})
    ])
  );

  assert.match(text, /Item\.getItemFamily\((?:arg_254|local_02)\)/u);
}

function testTerminalTrailingBytesDoNotEmitStopBanner() {
  const text = renderPseudo({
    ...makeIr([op(0, "ret", {})]),
    body: {
      end_reason: "terminal_return_then_trailing_bytes",
      unsupported_opcode_name: "SEARCH_SURFACE"
    }
  });

  assert.doesNotMatch(text, /decompilation stopped at SEARCH_SURFACE/u);
}

testSelectorLadderUsesEqualityCompareAndFalseBranch();
testCountedLoopRendersWithContinueCondition();
testAlarmhatStyleSelectorLoopStructuring();
testLoopTailKeepsOuterExitLabels();
testForeachLoopStructuring();
testCommentPrefixedReturnLabelCountsAsReturn();
testCleanupOpsStayHiddenInPseudocode();
testWidthShimOpsStayHiddenInAssignmentsAndDiscards();
testUnaryAndConcatOpsRenderAsExpressions();
testUndecodedLoopSetupStaysHidden();
testShiftAndStringCompareOpsRenderAsExpressions();
testStringCompareOpsRenderAsExpressions();
testCreateListAndAppendListRenderAsListExpressions();
testCompoundFalseBranchStaysNegated();
testShapeWhitelistSelectorLoopRendersAsNearbyItems();
testSelectorChainRendersAsSwitch();
testRegionEndGotoCountsAsStructuredExit();
testRealTriggerSlot20NoLongerFallsBackToBlocks();
testRealBlastpacUseNoLongerFallsBackToBlocks();
testRealRegretBridgeSlot22KeepsSideEffectsAndProcessResult();
testRealRegretChangerHatchRendersRoofSelector();
testRealBroBootEquipRendersSwitch();
testRealBroBootEnterFastAreaNoLongerFallsBackToBlocks();
testImportedIntrinsicTablesResolveKnownOrdinals();
testGlobalAddressFeedsIntrinsicsAndLoopnextStaysHidden();
testNamedIntrinsic003cRendersAsItemFamily();
testTerminalTrailingBytesDoNotEmitStopBanner();

console.log("usecode structuring regression checks passed");