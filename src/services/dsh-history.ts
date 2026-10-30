import type { SessionMetrics } from "./session-metrics"
import type { ChatMessage, TimelineItem, ToolActivity } from "../types"

export interface DshSessionSummary {
  sessionId: string
  cwd: string
  title: string
  updatedAt: number
}

export interface DshWireEvent {
  type: string
  seq: number
  time: number
  data: unknown
}

export interface DshHistoryPage {
  items: TimelineItem[]
  hasMore: boolean
  throughSeq: number
  beforeSeq?: number
  title?: string
}

export interface DshHistoryReader {
  readMetrics?(sessionId: string): Promise<SessionMetrics>
  start(): Promise<void>
  listSessions(): Promise<DshSessionSummary[]>
  readHistory(sessionId: string, throughSeq?: number, beforeSeq?: number): Promise<DshHistoryPage>
  close(): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function messageContent(data: Record<string, unknown>) {
  const message = isRecord(data.message) ? data.message : data
  const reasoning: string[] = []
  const content: string[] = []
  if (typeof message.content === "string") return { content: message.content, reasoning: undefined }
  if (!Array.isArray(message.content)) return { content: "", reasoning: undefined }
  for (const block of message.content) {
    if (!isRecord(block) || typeof block.type !== "string") continue
    if (block.type === "reasoning" || block.type === "thinking") {
      const value = text(block.text)
      if (value) reasoning.push(value)
    } else if (block.type === "text") {
      const value = text(block.text)
      if (value) content.push(value)
    } else if (block.type === "resource_link") {
      const name = text(block.name) ?? text(block.uri) ?? "资源"
      const uri = text(block.uri)
      content.push(uri ? `[${name}](${uri})` : `[${name}]`)
    } else if (block.type === "image") {
      const name = text(block.name) ?? "图片"
      const uri = text(block.uri)
      content.push(uri ? `![${name}](${uri})` : `[${name}]`)
    } else if (block.type === "file") {
      const name = text(block.name) ?? text(block.path) ?? "文件"
      const uri = text(block.uri) ?? text(block.path)
      content.push(uri ? `[${name}](${uri})` : `[${name}]`)
    }
  }
  return { content: content.join(""), reasoning: reasoning.length ? reasoning.join("\n") : undefined }
}

function message(sessionId: string, event: DshWireEvent, role: ChatMessage["role"]): ChatMessage {
  const data = isRecord(event.data) ? event.data : {}
  const content = messageContent(data)
  const message = isRecord(data.message) ? data.message : data
  return {
    kind: "message",
    id: `history-${sessionId}-${event.seq}`,
    role,
    content: content.content,
    ...(content.reasoning ? { reasoning: content.reasoning } : {}),
    status: "done",
    createdAt: event.time,
    source: "dsh",
    ...(text(message.model) ? { model: text(message.model) } : {}),
  }
}

function toolKind(name: string): ToolActivity["toolKind"] {
  const value = name.toLowerCase()
  if (value.includes("delete") || value.includes("remove")) return "delete"
  if (value.includes("write") || value.includes("edit")) return "edit"
  if (value.includes("move") || value.includes("rename")) return "move"
  if (value.includes("read")) return "read"
  if (value.includes("search") || value.includes("grep") || value.includes("glob")) return "search"
  if (value.includes("bash") || value.includes("shell") || value.includes("exec")) return "execute"
  if (value.includes("think")) return "think"
  if (value.includes("fetch") || value.includes("web")) return "fetch"
  return "other"
}

function toolCallId(data: Record<string, unknown>): string | undefined {
  const call = isRecord(data.call) ? data.call : data
  const message = isRecord(data.message) ? data.message : {}
  const source = isRecord(message.source) ? message.source : {}
  return text(data.callId) ?? text(message.toolCallId) ?? text(source.callId) ?? text(call.id) ?? text(data.id)
}

function tool(sessionId: string, event: DshWireEvent, existing?: ToolActivity): ToolActivity {
  const data = isRecord(event.data) ? event.data : {}
  const call = isRecord(data.call) ? data.call : data
  const id = toolCallId(data) ?? `unknown-${event.seq}`
  const name = text(call.name) ?? text(data.name) ?? text(data.toolName) ?? existing?.title ?? "工具调用"
  const rawInput = call.arguments ?? call.args ?? call.input ?? data.input ?? existing?.rawInput
  const failed = data.error !== undefined || data.isError === true
    || (isRecord(data.result) && (data.result.error !== undefined || data.result.success === false))
  return {
    kind: "tool",
    id: `history-${sessionId}-${id}`,
    title: name,
    toolKind: toolKind(name),
    status: event.type === "tool/result" ? failed ? "failed" : "completed" : "in_progress",
    createdAt: existing?.createdAt ?? event.time,
    ...(rawInput !== undefined ? { rawInput } : {}),
    ...(event.type === "tool/result" ? { rawOutput: data.result ?? data.output ?? data.error ?? data.message } : {}),
  }
}

export function mapHistoryRecords(sessionId: string, records: readonly DshWireEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const event of records) {
    if (!Number.isSafeInteger(event.seq) || !Number.isFinite(event.time)) continue
    if (event.type === "user/message" || event.type === "assistant/message") {
      const data = isRecord(event.data) ? event.data : {}
      const body = isRecord(data.message) ? data.message : data
      const source = isRecord(body.source) ? body.source : isRecord(data.source) ? data.source : {}
      if (event.type === "user/message" && source.kind !== undefined && source.kind !== "user") continue
      const item = message(sessionId, event, event.type === "user/message" ? "user" : "assistant")
      if (item.content || item.reasoning) items.push(item)
    } else if (event.type === "tool/call" || event.type === "tool/result") {
      const data = isRecord(event.data) ? event.data : {}
      const id = toolCallId(data)
      const existing = id ? items.findLast(item => item.kind === "tool" && item.id === `history-${sessionId}-${id}`) as ToolActivity | undefined : undefined
      const activity = tool(sessionId, event, existing)
      if (existing) {
        existing.title = activity.title
        existing.toolKind = activity.toolKind
        existing.rawInput = activity.rawInput
        if (event.type === "tool/result") {
          existing.status = activity.status
          existing.rawOutput = activity.rawOutput
        }
      } else {
        items.push(activity)
      }
    }
  }
  return items
}
