import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { ChatMessage, Conversation, PersistedChat, TimelineItem, ToolActivity } from "../types"

export interface LoadedChat extends Omit<PersistedChat, "conversations"> {
  conversations: Conversation[]
}

export interface ChatStorage {
  load(): { data: LoadedChat | null; error: string | null }
  save(data: PersistedChat): void
}

const defaultPath = resolve(process.cwd(), ".mini-dsh", "ui-v2.json")

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${name}`)
  return value
}

function requiredTime(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${name}`)
  return value
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new Error(`Invalid ${name}`)
  return value
}

function parseItem(value: unknown): TimelineItem {
  if (!isRecord(value)) throw new Error("Invalid timeline item")
  const id = requiredString(value.id, "item id")
  const createdAt = requiredTime(value.createdAt, "item creation time")
  if (value.kind === "message") {
    if (value.role !== "user" && value.role !== "assistant") throw new Error("Invalid message role")
    if (typeof value.content !== "string") throw new Error("Invalid message content")
    const status = value.status
    if (status !== "streaming" && status !== "done" && status !== "stopped" && status !== "error") throw new Error("Invalid message status")
    const item: ChatMessage = {
      kind: "message", id, role: value.role, content: value.content,
      status: status === "streaming" ? "stopped" : status,
      createdAt,
      reasoning: optionalString(value.reasoning, "reasoning"),
      source: "dsh",
      model: optionalString(value.model, "model"),
      error: optionalString(value.error, "message error"),
    }
    if (isRecord(value.usage)) {
      item.usage = {
        promptTokens: value.usage.promptTokens === undefined ? undefined : requiredTime(value.usage.promptTokens, "prompt tokens"),
        completionTokens: value.usage.completionTokens === undefined ? undefined : requiredTime(value.usage.completionTokens, "completion tokens"),
        totalTokens: requiredTime(value.usage.totalTokens, "total tokens"),
        contextSize: value.usage.contextSize === undefined ? undefined : requiredTime(value.usage.contextSize, "context size"),
      }
    }
    return item
  }
  if (value.kind === "tool") {
    const status = value.status
    if (status !== "pending" && status !== "in_progress" && status !== "completed" && status !== "failed") throw new Error("Invalid tool status")
    const item: ToolActivity = {
      kind: "tool", id,
      title: requiredString(value.title, "tool title"),
      toolKind: "other",
      status: status === "in_progress" ? "failed" : status,
      createdAt,
      rawInput: value.rawInput,
      rawOutput: value.rawOutput,
    }
    if (Array.isArray(value.content)) item.content = value.content as ToolActivity["content"]
    if (Array.isArray(value.locations)) item.locations = value.locations as ToolActivity["locations"]
    if (typeof value.toolKind === "string" && ["read", "edit", "delete", "move", "search", "execute", "think", "fetch", "switch_mode", "other"].includes(value.toolKind)) {
      item.toolKind = value.toolKind as ToolActivity["toolKind"]
    }
    return item
  }
  throw new Error("Invalid timeline item kind")
}

function parseConversation(value: unknown): Conversation {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("Invalid conversation")
  return {
    id: requiredString(value.id, "conversation id"),
    sessionId: optionalString(value.sessionId, "session id"),
    title: requiredString(value.title, "conversation title"),
    items: value.items.map(parseItem),
    draft: optionalString(value.draft, "draft"),
    createdAt: requiredTime(value.createdAt, "conversation creation time"),
    updatedAt: requiredTime(value.updatedAt, "conversation update time"),
    cwd: requiredString(value.cwd, "workspace"),
    dshHome: requiredString(value.dshHome, "session DSH_HOME"),
    configOptions: [],
    historyCached: value.historyCached !== false,
    running: false,
    active: false,
    permissionPending: false,
  }
}

function parse(value: unknown): PersistedChat {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.conversations)) throw new Error("Unsupported UI data")
  const conversations = value.conversations.map(parseConversation)
  if (!conversations.length) throw new Error("No conversations")
  const activeId = requiredString(value.activeId, "active conversation")
  if (!conversations.some(conversation => conversation.id === activeId)) throw new Error("Missing active conversation")
  return {
    version: 2,
    activeId,
    model: requiredString(value.model, "model"),
    reasoning: requiredString(value.reasoning, "reasoning"),
    workspace: requiredString(value.workspace, "workspace"),
    dshHome: requiredString(value.dshHome, "DSH_HOME"),
    conversations: conversations.map(conversation => ({
      id: conversation.id,
      sessionId: conversation.sessionId,
      title: conversation.title,
      items: conversation.items,
      draft: conversation.draft,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      cwd: conversation.cwd,
      dshHome: conversation.dshHome,
      historyCached: conversation.historyCached,
    })),
  }
}

export function createChatStorage(path = process.env.MINI_DSH_STATE_FILE ? resolve(process.cwd(), process.env.MINI_DSH_STATE_FILE) : defaultPath): ChatStorage {
  return {
    load() {
      try {
        const data = parse(JSON.parse(readFileSync(path, "utf8")))
        return {
          data: {
            ...data,
            conversations: data.conversations.map(conversation => ({
              ...conversation,
              configOptions: [],
              running: false,
              active: false,
              permissionPending: false,
            })),
          },
          error: null,
        }
      } catch (error) {
        if (isRecord(error) && error.code === "ENOENT") return { data: null, error: null }
        return { data: null, error: "无法读取界面缓存，已暂停保存以保护原文件。dsh 会话记录不受影响。" }
      }
    },
    save(data) {
      const validated = parse(data)
      mkdirSync(dirname(path), { recursive: true })
      const temporary = `${path}.${process.pid}.tmp`
      writeFileSync(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
      renameSync(temporary, path)
    },
  }
}
