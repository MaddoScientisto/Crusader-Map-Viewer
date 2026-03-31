import assert from "node:assert/strict";

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

testSelectorLadderUsesEqualityCompareAndFalseBranch();
testCountedLoopRendersWithContinueCondition();
testAlarmhatStyleSelectorLoopStructuring();

console.log("usecode structuring regression checks passed");