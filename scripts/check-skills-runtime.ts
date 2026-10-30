import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DshRuntime } from "../src/services/dsh-runtime"
import { DshWebReader } from "../src/services/dsh-web-reader"

const root = mkdtempSync(join(tmpdir(), "mini-dsh-skill-"))
const workspace = join(root, "workspace")
const dshHome = join(root, "home")
mkdirSync(join(workspace, ".agents/skills/smoke-skill"), { recursive: true })
writeFileSync(join(workspace, ".agents/skills/smoke-skill/SKILL.md"), "---\nname: smoke-skill\ndescription: Skill invocation smoke test\n---\nSKILL_INJECTION_SENTINEL_9281\nReply with OK.\n")

writeFileSync(join(workspace, "sample file.txt"), "FILE_REFERENCE_SENTINEL_4821")
let fileMentionReceived = false
let fileRead = false
let requestedRead = false
let injected = false
let requests = 0
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const body = await req.text()
    requests++
    injected ||= body.includes("SKILL_INJECTION_SENTINEL_9281")
    const request = JSON.parse(body)
    const userTexts: string[] = request.messages.filter((message: { role: string }) => message.role === "user")
      .flatMap((message: { content: string | Array<{ type: string; text?: string }> }) => typeof message.content === "string"
        ? [message.content] : message.content.filter(block => block.type === "text").map(block => block.text ?? ""))
    fileMentionReceived ||= userTexts.some(text => text.includes('@"sample file.txt"'))
    fileRead ||= body.includes("FILE_REFERENCE_SENTINEL_4821")
    const readNow = fileMentionReceived && !requestedRead
    if (readNow) requestedRead = true
    const events = [
      { type:"message_start",message:{id:"smoke",type:"message",role:"assistant",model:"deepseek-v4-flash",content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}},
      { type: "content_block_start", index: 0, content_block: readNow ? { type: "tool_use", id: "read-fixture", name: "read", input: {} } : { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: readNow ? { type: "input_json_delta", partial_json: JSON.stringify({ file_path: "sample file.txt" }) } : { type: "text_delta", text: "OK" } },
      { type:"content_block_stop",index:0},
      { type:"message_delta",delta:{stop_reason: readNow ? "tool_use" : "end_turn",stop_sequence:null},usage:{output_tokens:1}},
      { type:"message_stop"},
    ]
    return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {headers:{"content-type":"text/event-stream"}})
  },
})
const runtime = new DshRuntime({
  workspace, dshHome,
  apiKey: "smoke-dummy-key",
  baseUrl: `http://127.0.0.1:${server.port}`,
  onUpdate: () => {},
  onPermission: async () => ({ outcome: { outcome: "cancelled" } }),
})
const reader = new DshWebReader({ workspace, dshHome })
let timer: ReturnType<typeof setTimeout> | undefined
try {
  await Promise.race([(async () => {
    const session = await runtime.newSession()
    const skills = await reader.listSkills(session.sessionId)
    if (!skills.some(s=>s.name==="smoke-skill")) throw new Error("Fixture skill missing from official catalog")
    console.log("Official catalog discovered fixture skill")
    const result = await runtime.prompt(session.sessionId, "/smoke-skill perform smoke test")
    if (!injected) throw new Error(`Skill instructions not injected; requests=${requests}, stop=${result.stopReason}`)
    console.log("ACP /smoke-skill injected instructions into local mock model request; stop="+result.stopReason)
    const fileResult = await runtime.prompt(session.sessionId, 'Read @"sample file.txt" and report its contents.')
    if (!fileMentionReceived || !fileRead || fileResult.stopReason !== "end_turn") throw new Error("File reference did not reach the model and read tool")
    console.log("ACP quoted @file reference reached the model; real dsh read returned fixture contents")
  })(), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Skill runtime smoke test timed out")), 45000)
  })])
} finally {
  clearTimeout(timer)
  try { await Promise.all([runtime.close(), reader.close()]) }
  finally {
    server.stop(true)
    rmSync(root, { recursive: true, force: true })
  }
}
