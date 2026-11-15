import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createChatStore } from "../src/state/chat"
import { createChatStorage } from "../src/state/storage"
import { searchHistorySessions, type DshHistoryReader, type DshSessionSummary } from "../src/services/dsh-history"
import type { DshRuntime } from "../src/services/dsh-runtime"
import type { PersistedChat } from "../src/types"

const directory = await mkdtemp(join(tmpdir(), "mini-dsh-search-"))
try {
  const sessions: DshSessionSummary[] = [
    { sessionId: "a", title: "Needle title", cwd: directory, updatedAt: 4 },
    { sessionId: "b", title: "Project", cwd: directory, updatedAt: 3 },
    { sessionId: "c", title: "Broken", cwd: directory, updatedAt: 2 },
    { sessionId: "d", title: "Other", cwd: directory, updatedAt: 1 },
  ]
  const reads: string[] = []
  const history: DshHistoryReader = {
    start: async () => {}, listSessions: async () => sessions, close: async () => {},
    readHistory: async (sessionId, throughSeq, beforeSeq) => {
      reads.push(`${sessionId}:${beforeSeq ?? "latest"}`)
      if (sessionId === "c") throw new Error("unreadable")
      if (sessionId === "b" && beforeSeq === undefined) return {
        items: [{ kind: "message", id: "b1", role: "user", content: "first page", status: "done", createdAt: 1 }],
        hasMore: true, throughSeq: 10, beforeSeq: 10,
      }
      if (sessionId === "b") return {
        items: [{ kind: "message", id: "b2", role: "assistant", content: "older NEEDLE content", status: "done", createdAt: 2 }],
        hasMore: false, throughSeq: throughSeq ?? 10,
      }
      return { items: [], hasMore: false, throughSeq: throughSeq ?? 0 }
    },
  }
  history.searchSessions = (query, signal) => searchHistorySessions(history, sessions, query, signal)
  assert.deepEqual(await searchHistorySessions(history, sessions, "needle"), ["a", "b"])
  assert.ok(!reads.some(read => read.startsWith("a:")))
  assert.ok(reads.includes("b:10"))
  const aborted = new AbortController()
  aborted.abort()
  assert.deepEqual(await searchHistorySessions(history, sessions, "needle", aborted.signal), [])

  const state: PersistedChat = {
    version: 2, activeId: "local", model: "model", reasoning: "high", workspace: directory,
    dshHome: join(directory, "dsh"), recentWorkspaces: [directory], removedSessionIds: [],
    conversations: [{ id: "local", title: "Local", items: [], createdAt: 1, updatedAt: 1, cwd: directory, dshHome: join(directory, "dsh"), historyCached: true }],
  }
  const storage = createChatStorage(join(directory, "state.json"))
  storage.save(state)
  const runtime = { close: async () => {} } as unknown as DshRuntime
  const store = createChatStore({ storage, runtime, history, workspace: directory, dshHome: join(directory, "dsh") })
  await store.ready
  store.query.value = "needle"
  await new Promise(resolve => setTimeout(resolve, 450))
  assert.deepEqual(store.filteredConversations.value.map(item => item.id), ["a", "b"])
  assert.equal(store.historySearching.value, false)
  assert.equal(store.historySearchError.value, "")
  store.query.value = "x"
  assert.equal(store.historySearching.value, false)
  await store.dispose()
  console.log("Global title, paginated content, cancellation and store search checks passed")
} finally {
  await rm(directory, { recursive: true, force: true })
}
