import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createChatStore } from "../src/state/chat"
import { createChatStorage } from "../src/state/storage"
import { collectWorkspaces, workspaceLabel } from "../src/services/workspaces"
import type { DshRuntime } from "../src/services/dsh-runtime"
import type { DshHistoryReader } from "../src/services/dsh-history"
import type { PersistedChat } from "../src/types"

assert.deepEqual(collectWorkspaces(["/one", "/two"], ["/two", "", " /three "]), ["/one", "/two", "/three"])
assert.equal(workspaceLabel("/one/project"), "project")
assert.equal(workspaceLabel("/"), "/")

const directory = await mkdtemp(join(tmpdir(), "mini-dsh-workspaces-"))
try {
  const path = join(directory, "state.json")
  const storage = createChatStorage(path)
  const conversation = {
    id: "one", title: "Project", items: [], createdAt: 1, updatedAt: 1,
    cwd: "/one", dshHome: "/dsh", historyCached: true,
  }
  const data: PersistedChat = {
    version: 2, activeId: "one", model: "model", reasoning: "high", workspace: "/two",
    dshHome: "/dsh", recentWorkspaces: ["/two", "/one"], removedSessionIds: [], conversations: [conversation],
  }
  storage.save(data)
  assert.deepEqual(storage.load().data?.recentWorkspaces, ["/two", "/one"])
  const legacy = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>
  delete legacy.recentWorkspaces
  await writeFile(path, JSON.stringify(legacy))
  assert.deepEqual(storage.load().data?.recentWorkspaces, ["/two", "/one"])

  const one = join(directory, "one")
  const two = join(directory, "two")
  await Promise.all([mkdir(one), mkdir(two)])
  let closes = 0
  const runtime = { close: async () => { closes++ } } as unknown as DshRuntime
  const history: DshHistoryReader = {
    start: async () => {}, listSessions: async () => [],
    readHistory: async () => ({ items: [], hasMore: false, throughSeq: 0 }), close: async () => {},
  }
  const store = createChatStore({
    storage: createChatStorage(join(directory, "store-state.json")), runtime, history,
    workspace: one, dshHome: join(directory, "dsh"),
  })
  await store.ready
  const first = store.active.value
  await store.setWorkspace(two)
  assert.equal(first.cwd, one)
  assert.equal(closes, 0)
  store.newConversation()
  assert.notEqual(store.active.value.id, first.id)
  assert.equal(store.active.value.cwd, two)
  assert.equal(first.cwd, one)
  store.persistNow()
  assert.deepEqual(storage.load().data?.recentWorkspaces, ["/two", "/one"])
  assert.deepEqual(createChatStorage(join(directory, "store-state.json")).load().data?.recentWorkspaces, [two, one])
  await store.dispose()
  console.log("Workspace selection, conversation isolation, labels and persistence checks passed")
} finally {
  await rm(directory, { recursive: true, force: true })
}
