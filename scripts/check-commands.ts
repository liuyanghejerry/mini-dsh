import assert from "node:assert/strict"
import { parseSkillCommands, slashQuery, filterCommands, mergeCommands } from "../src/services/slash-commands"
import { applyAcpUpdate } from "../src/services/dsh-events"
import { createChatStore } from "../src/state/chat"
import type { DshRuntime } from "../src/services/dsh-runtime"

const skills = parseSkillCommands({ skills: [
  { name: "review-code", description: "审查代码", modelInvocable: false },
  { name: "write-doc", description: "Write documentation", modelInvocable: true },
] })
assert.equal(skills.length, 2, "User-only skills must remain selectable")
assert.throws(() => parseSkillCommands({ skills: [{ name: "bad/path", description: "" }] }))
assert.throws(() => parseSkillCommands({}))
assert.equal(slashQuery("/"), "")
assert.equal(slashQuery("/review"), "review")
assert.equal(slashQuery("/审查"), "审查")
for (const input of ["/usr/bin", "hello /review", "/review task", "5/8", "/review\n"]) assert.equal(slashQuery(input), undefined)
assert.deepEqual(filterCommands(skills, "审查"), [skills[0]!])
assert.deepEqual(filterCommands(skills, "WRITE"), [skills[1]!])
assert.equal(filterCommands(skills, "missing").length, 0)
assert.equal(mergeCommands([{ name: "review-code", description: "ACP" }], skills).length, 2)
assert.equal(mergeCommands([{ name: "review-code", description: "ACP" }], skills)[0]?.description, "ACP")

let counter = 0
let failCatalog = false
let catalogCalls = 0
const prompts: string[] = []
const runtime = {
  start: async () => {}, close: async () => {}, listSessions: async () => [],
  newSession: async () => ({ sessionId: `session-${++counter}` }),
  resumeSession: async () => ({}),
  setConfig: async () => ({ configOptions: [] }),
  prompt: async (_id: string, text: string) => { prompts.push(text); return { stopReason: "end_turn" } },
} as unknown as DshRuntime
const store = createChatStore({
  runtime, workspace: "/tmp", dshHome: "/tmp/mini-dsh-command-test", environmentApiKey: "",
  storage: { load: () => ({ data: null, error: null }), save: () => {} },
  history: {
    start: async () => {}, close: async () => {}, listSessions: async () => [],
    readHistory: async () => ({ items: [], hasMore: false, throughSeq: 0 }),
    listSkills: async id => {
      catalogCalls++
      if (failCatalog) throw new Error("Catalog unavailable")
      return id === "session-1" ? skills : []
    },
  },
})
try {
  await store.ready
  await Promise.all([store.loadCommands(), store.loadCommands()])
  assert.equal(catalogCalls, 1, "Concurrent loads share one preparation")
  assert.deepEqual(store.commands.value, skills)
  assert.equal(store.active.value.items.length, 0, "Discovery must not send a prompt")
  const firstId = store.activeId.value
  applyAcpUpdate(store.active.value, { sessionUpdate: "available_commands_update", availableCommands: [{ name: "help", description: "Help" }] })
  assert.equal(store.commands.value.length, 3)
  applyAcpUpdate(store.active.value, { sessionUpdate: "available_commands_update", availableCommands: [] })
  assert.equal(store.commands.value.length, 2)
  await store.send("/review-code review this patch")
  assert.deepEqual(prompts, ["/review-code review this patch"])
  store.newConversation()
  assert.deepEqual(store.commands.value, [], "Commands must not leak between sessions")
  failCatalog = true
  await store.loadCommands()
  assert.match(store.active.value.commandsError ?? "", /Catalog unavailable/)
  assert.equal(store.active.value.commandsLoading, false)
  failCatalog = false
  await store.loadCommands()
  assert.equal(store.active.value.commandsError, undefined)
  store.selectConversation(firstId)
  assert.deepEqual(store.commands.value, skills)
} finally { await store.dispose() }
console.log("Slash commands and session catalog regression checks passed")
