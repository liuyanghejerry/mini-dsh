import assert from "node:assert/strict"
import { TaskNotificationTracker } from "../src/services/task-notifications"
import type { Conversation } from "../src/types"

function conversation(): Conversation {
  return {
    id: "one", title: "Background", items: [], createdAt: 1, updatedAt: 1, cwd: "/work", dshHome: "/dsh",
    configOptions: [], historyCached: true, running: true, active: true, permissionPending: false,
  }
}
const current = conversation()
const tracker = new TaskNotificationTracker([current])
assert.deepEqual(tracker.update([current], "other"), [])
current.permissionPending = true
assert.deepEqual(tracker.update([current], "one"), [])
assert.deepEqual(tracker.update([current], "other"), [])
current.permissionPending = false
tracker.update([current], "one")
current.permissionPending = true
assert.equal(tracker.update([current], "other")[0]?.kind, "permission")
current.permissionPending = false
tracker.update([current], "other")
current.running = false
current.items.push({ kind: "message", id: "answer", role: "assistant", content: "finished", status: "done", createdAt: 2 })
assert.equal(tracker.update([current], "other")[0]?.kind, "completed")
assert.deepEqual(tracker.update([current], "other"), [])
current.running = true
tracker.update([current], "other")
current.running = false
current.items.push({ kind: "message", id: "error", role: "assistant", content: "", error: "boom", status: "error", createdAt: 3 })
const failed = tracker.update([current], "other")[0]
assert.equal(failed?.kind, "failed")
assert.equal(failed?.body, "boom")
console.log("Background completion, failure, permission and active-chat suppression checks passed")
