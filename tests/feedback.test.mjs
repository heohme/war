import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeFeedback } from "../lib/feedback.ts";

test("feedback keeps a bounded, token-free diagnostic payload", () => {
  const feedback = sanitizeFeedback({
    description: "  第三回合攻击方向没有更新  ",
    logs: Array.from({ length: 45 }, (_, index) => ({ at: index, type: "点击", detail: `操作 ${index}` })),
    context: { screen: "planning", roomId: "room-1", token: "must-not-upload", userAgent: "agent" },
  });
  assert.ok(feedback);
  assert.equal(feedback.description, "第三回合攻击方向没有更新");
  assert.equal(feedback.logs.length, 40);
  assert.equal(feedback.context.roomId, "room-1");
  assert.equal("token" in feedback.context, false);
});

test("feedback rejects an empty description", () => {
  assert.equal(sanitizeFeedback({ description: "   ", logs: [] }), null);
});
