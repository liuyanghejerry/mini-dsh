import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { conversationFileName, conversationToMarkdown, writeConversationMarkdown } from "../src/services/conversation-export"
import type { Conversation } from "../src/types"

const directory = await mkdtemp(join(tmpdir(), "mini-dsh-export-"))
try {
  const attachmentPath = join(directory, "my file.txt")
  const conversation: Conversation = {
    id: "one", sessionId: "session", title: "Export / test", items: [
      { kind: "message", id: "user", role: "user", content: "display", prompt: "inspect", attachments: [{ path: attachmentPath, name: "my file.txt", image: false }], status: "done", createdAt: 1 },
      { kind: "message", id: "assistant", role: "assistant", content: "answer", reasoning: "thinking", status: "done", createdAt: 2 },
      { kind: "tool", id: "tool", title: "edit", toolKind: "edit", status: "completed", createdAt: 3,
        content: [{ type: "diff", path: join(directory, "code.ts"), oldText: "before\n", newText: "after\n" }], rawOutput: { text: "complete" } },
    ],
    createdAt: 1, updatedAt: 3, cwd: directory, dshHome: join(directory, "dsh"), configOptions: [], historyCached: true,
    running: false, active: false, permissionPending: false,
  }
  const markdown = conversationToMarkdown(conversation)
  assert.ok(markdown.includes("# Export / test"))
  assert.ok(markdown.includes("inspect"))
  assert.ok(markdown.includes("file:///"))
  assert.ok(markdown.includes("my%20file.txt"))
  assert.ok(markdown.includes("thinking"))
  assert.ok(markdown.includes("-before"))
  assert.ok(markdown.includes("+after"))
  assert.ok(markdown.includes("complete"))
  const path = join(directory, "export.md")
  await writeConversationMarkdown(conversation, path)
  assert.equal(await readFile(path, "utf8"), markdown)
  assert.equal(conversationFileName(conversation), "Export - test.md")
  console.log("Markdown messages, attachments, tools, diffs and file export checks passed")
} finally {
  await rm(directory, { recursive: true, force: true })
}
