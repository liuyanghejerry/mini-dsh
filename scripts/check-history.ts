import assert from "node:assert/strict"
import { mapHistoryRecords, type DshWireEvent } from "../src/services/dsh-history"

const event = (seq: number, type: string, data: unknown): DshWireEvent => ({ seq, type, time: seq, data })
const items = mapHistoryRecords("test", [
  event(1, "user/message", { content: "真实提问", source: { kind: "user" } }),
  event(2, "user/message", { content: "内部时间提示", source: { kind: "time-context" } }),
  event(3, "user/message", { message: { content: "内部运行环境", source: { kind: "runtime-context" } } }),
  event(4, "assistant/message", { content: [] }),
  event(5, "tool/call", { call: { id: "call-1", name: "bash", arguments: "pwd" } }),
  event(6, "tool/result", { message: { toolCallId: "call-1", content: [{ type: "text", text: "/workspace" }] } }),
  event(7, "assistant/message", { content: [{ type: "text", text: "最终回复" }] }),
])
assert.equal(items.length, 3)
assert.equal(items[0]?.kind, "message")
const tool = items[1]
assert.equal(tool?.kind, "tool")
if (tool?.kind === "tool") {
  assert.equal(tool.title, "bash")
  assert.equal(tool.status, "completed")
  assert.ok(tool.rawOutput)
}
assert.equal(items[2]?.kind === "message" && items[2].content, "最终回复")
console.log("History mapping regression checks passed")
