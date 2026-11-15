import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createChatStore } from "../src/state/chat"
import { createChatStorage } from "../src/state/storage"
import { applyAcpUpdate } from "../src/services/dsh-events"
import type { DshRuntime } from "../src/services/dsh-runtime"
import type { DshHistoryReader, DshSessionSummary } from "../src/services/dsh-history"
import type { PersistedChat, PersistedConversation } from "../src/types"

const directory = await mkdtemp(join(tmpdir(), "mini-dsh-conversations-"))
try {
  const home = join(directory, "dsh")
  const statePath = join(directory, "state.json")
  const conversation = (id: string, updatedAt: number): PersistedConversation => ({
    id, sessionId: id, title: `Cached ${id}`, items: [], createdAt: updatedAt, updatedAt,
    cwd: directory, dshHome: home, historyCached: true,
  })
  const initial: PersistedChat = {
    version: 2, activeId: "a", model: "model", reasoning: "high", workspace: directory,
    dshHome: home, recentWorkspaces: [directory], removedSessionIds: [],
    conversations: [conversation("a", 10), conversation("b", 20), conversation("c", 30)],
  }
  createChatStorage(statePath).save(initial)
  const sessions: DshSessionSummary[] = ["a", "b", "c"].map((sessionId, index) => ({
    sessionId, title: `Official ${sessionId}`, cwd: directory, updatedAt: (index + 1) * 10,
  }))
  const deleted: string[] = []
  let canDelete = false
  let failDelete = ""
  const runtime = {
    start: async () => {}, closeSession: async () => {}, close: async () => {},
    get canDeleteSessions() { return canDelete },
    deleteSession: async (sessionId: string) => {
      if (sessionId === failDelete) throw new Error("delete failed")
      deleted.push(sessionId)
    },
  } as unknown as DshRuntime
  const history: DshHistoryReader = {
    start: async () => {}, listSessions: async () => sessions.filter(session => !deleted.includes(session.sessionId)),
    readHistory: async sessionId => ({ items: [], hasMore: false, throughSeq: 0, title: `Official ${sessionId}` }),
    close: async () => {},
  }
  const options = { storage: createChatStorage(statePath), runtime, history, workspace: directory, dshHome: home }
  const store = createChatStore(options)
  await store.ready
  assert.equal(store.renameConversation("a", "My project"), true)
  assert.equal(store.renameConversation("a", "  "), false)
  store.togglePinned("a")
  assert.equal(store.filteredConversations.value[0]?.id, "a")
  applyAcpUpdate(store.conversations.value.find(item => item.id === "a")!, {
    sessionUpdate: "session_info_update", title: "Replacement",
  })
  assert.equal(store.conversations.value.find(item => item.id === "a")?.title, "My project")
  store.selectConversation("a")
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(store.active.value.title, "My project")
  assert.equal(await store.deleteConversation("a"), true)
  assert.equal(store.conversations.value.some(item => item.id === "a"), false)
  assert.deepEqual(createChatStorage(statePath).load().data?.removedSessionIds, ["a"])
  await store.dispose()

  const restored = createChatStore(options)
  await restored.ready
  assert.equal(restored.conversations.value.some(item => item.id === "a"), false)
  assert.equal(restored.conversations.value.find(item => item.id === "b")?.title, "Official b")
  canDelete = true
  assert.equal(await restored.deleteConversation("b"), true)
  assert.deepEqual(deleted, ["b"])
  assert.deepEqual(createChatStorage(statePath).load().data?.removedSessionIds, ["a"])
  failDelete = "c"
  assert.equal(await restored.deleteConversation("c"), false)
  assert.equal(restored.conversations.value.some(item => item.id === "c"), true)
  assert.match(restored.notice.value ?? "", /delete failed/)
  await restored.dispose()
  console.log("Rename, pinning, hidden-session sync and permanent deletion checks passed")
} finally {
  await rm(directory, { recursive: true, force: true })
}
