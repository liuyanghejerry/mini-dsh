import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ContentBlock } from "@agentclientprotocol/sdk"
import { createChatStore } from "../src/state/chat"
import { createChatStorage } from "../src/state/storage"
import { attachment } from "../src/services/attachments"
import { loadSharp } from "../src/services/image-codec"
import type { DshRuntime } from "../src/services/dsh-runtime"
import type { DshHistoryReader } from "../src/services/dsh-history"

const directory = await mkdtemp(join(tmpdir(), "mini-dsh-retry-"))
try {
  const document = join(directory, "note.txt")
  const image = join(directory, "image.png")
  await Promise.all([
    writeFile(document, "notes"),
    loadSharp()({ create: { width: 1, height: 1, channels: 4, background: "#ffffff" } }).png().toFile(image),
  ])
  const files = await Promise.all([attachment(document), attachment(image)])
  const prompts: Array<{ text: string; blocks: ContentBlock[] }> = []
  const runtime = {
    start: async () => {},
    newSession: async () => ({ sessionId: "session", configOptions: [] }),
    resumeSession: async () => ({ configOptions: [] }),
    setConfig: async () => ({ configOptions: [] }),
    prompt: async (_sessionId: string, text: string, blocks: ContentBlock[]) => {
      prompts.push({ text, blocks })
      return { stopReason: "end_turn" }
    },
    close: async () => {},
  } as unknown as DshRuntime
  const history: DshHistoryReader = {
    start: async () => {}, listSessions: async () => [],
    readHistory: async () => ({
      items: createChatStorage(statePath).load().data?.conversations[0]?.items ?? [], hasMore: false, throughSeq: 0,
    }), close: async () => {},
  }
  const statePath = join(directory, "state.json")
  const options = { storage: createChatStorage(statePath), runtime, history, workspace: directory, dshHome: join(directory, "dsh") }
  const store = createChatStore(options)
  await store.ready
  assert.equal(await store.send("please inspect", files), true, JSON.stringify({ notice: store.notice.value, items: store.active.value.items }))
  const first = store.active.value.items[0]
  assert.ok(first?.kind === "message")
  assert.equal(first.prompt, "please inspect")
  assert.equal(first.attachments?.length, 2)
  assert.equal(prompts[0]?.text, "please inspect")
  assert.deepEqual(prompts[0]?.blocks.map(block => block.type), ["resource_link", "image"])

  await store.retry()
  assert.equal(prompts.length, 2)
  assert.equal(prompts[1]?.text, "please inspect")
  assert.ok(!prompts[1]?.text.includes("note.txt"))
  assert.deepEqual(prompts[1]?.blocks.map(block => block.type), ["resource_link", "image"])
  await store.dispose()

  const restored = createChatStore(options)
  await restored.ready
  await restored.retry()
  assert.equal(prompts.length, 3)
  assert.equal(prompts[2]?.text, "please inspect")
  assert.deepEqual(prompts[2]?.blocks.map(block => block.type), ["resource_link", "image"])
  await restored.dispose()
  console.log("Edit source metadata, regeneration attachments and persisted retry checks passed")
} finally {
  await rm(directory, { recursive: true, force: true })
}
