import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import type { ChatMessage, Conversation, ToolActivity } from "../types"
import { createDiffPatch } from "./tool-diffs"

function fenced(value: string, language = ""): string {
  const longest = Math.max(0, ...[...value.matchAll(/`{3,}/g)].map(match => match[0].length))
  const fence = "`".repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${value}\n${fence}`
}

function messageMarkdown(message: ChatMessage): string {
  const content = message.prompt === undefined ? message.content : [
    message.prompt,
    ...(message.attachments ?? []).map(file => `[${file.image ? "图片" : "文件"}：${file.name}](${pathToFileURL(file.path).href})`),
  ].filter(Boolean).join("\n")
  const sections = [`## ${message.role === "user" ? "用户" : "mini dsh"}`, content]
  if (message.reasoning) sections.push("### 思考过程", message.reasoning)
  if (message.status === "error") sections.push(`> 执行失败：${message.error ?? "未知错误"}`)
  else if (message.status === "stopped") sections.push("> 本次生成已停止")
  return sections.join("\n\n")
}

function toolMarkdown(tool: ToolActivity): string {
  const sections = [`### 工具：${tool.title}`, `状态：${tool.status}`]
  if (tool.locations?.length) sections.push(tool.locations.map(location => `- [${location.path}${location.line ? `:${location.line}` : ""}](${pathToFileURL(location.path).href})`).join("\n"))
  for (const entry of tool.content ?? []) {
    if (entry.type === "content" && entry.content.type === "text") sections.push(fenced(entry.content.text))
    else if (entry.type === "diff") sections.push(`#### ${entry.path}`, fenced(createDiffPatch(entry).patch, "diff"))
  }
  if (tool.rawInput !== undefined) sections.push("#### 输入", fenced(JSON.stringify(tool.rawInput, null, 2), "json"))
  if (tool.rawOutput !== undefined) sections.push("#### 输出", fenced(JSON.stringify(tool.rawOutput, null, 2), "json"))
  return sections.join("\n\n")
}

export function conversationToMarkdown(conversation: Conversation): string {
  const sections = [
    `# ${conversation.title}`,
    `- 工作区：${conversation.cwd}${conversation.sessionId ? `\n- 会话 ID：${conversation.sessionId}` : ""}`,
    ...conversation.items.map(item => item.kind === "message" ? messageMarkdown(item) : toolMarkdown(item)),
  ]
  return `${sections.join("\n\n")}\n`
}

export function conversationFileName(conversation: Conversation): string {
  const name = conversation.title.replace(/[\\/:*?"<>|\x00-\x1F]/g, "-").trim().replace(/^\.+/, "")
  return `${Array.from(name || "mini-dsh-conversation").slice(0, 60).join("")}.md`
}

export async function writeConversationMarkdown(conversation: Conversation, path: string): Promise<void> {
  await writeFile(path, conversationToMarkdown(conversation), "utf8")
}
