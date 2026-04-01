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
testRegionEndGotoCountsAsStructuredExit();
testRealTriggerSlot20NoLongerFallsBackToBlocks();
testRealBlastpacUseNoLongerFallsBackToBlocks();
testImportedIntrinsicTablesResolveKnownOrdinals();
testGlobalAddressFeedsIntrinsicsAndLoopnextStaysHidden();
testNamedIntrinsic003cRendersAsItemFamily();
testTerminalTrailingBytesDoNotEmitStopBanner();

console.log("usecode structuring regression checks passed");