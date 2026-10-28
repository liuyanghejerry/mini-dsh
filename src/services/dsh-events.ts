import type { ContentBlock, SessionUpdate, ToolCall, ToolCallUpdate } from "@agentclientprotocol/sdk"
import type { ChatMessage, Conversation, ToolActivity } from "../types"

export function lastAssistant(conversation: Conversation): ChatMessage | undefined {
  return conversation.items.findLast(item => item.kind === "message" && item.role === "assistant") as ChatMessage | undefined
}

function assistant(conversation: Conversation, messageId: string | null | undefined, model?: string): ChatMessage {
  const id = messageId ?? conversation.currentAssistantId ?? `assistant-${crypto.randomUUID()}`
  conversation.currentAssistantId = id
  const existing = conversation.items.find(item => item.kind === "message" && item.id === id)
  if (existing) return existing as ChatMessage
  const item: ChatMessage = {
    kind: "message",
    id,
    role: "assistant",
    content: "",
    status: "streaming",
    createdAt: Date.now(),
    source: "dsh",
    model,
  }
  conversation.items.push(item)
  return item
}

function appendContent(message: ChatMessage, content: ContentBlock) {
  if (content.type === "text") message.content += content.text
  else if (content.type === "resource_link") message.content += `[${content.name}](${content.uri})`
  else message.content += `[${content.type}]`
}

function updateTool(conversation: Conversation, update: ToolCall | ToolCallUpdate) {
  let item = conversation.items.find(entry => entry.kind === "tool" && entry.id === update.toolCallId) as ToolActivity | undefined
  if (!item) {
    item = {
      kind: "tool",
      id: update.toolCallId,
      title: update.title ?? update.name ?? "工具调用",
      toolKind: update.kind ?? "other",
      status: update.status ?? "pending",
      createdAt: Date.now(),
    }
    conversation.items.push(item)
  }
  if (update.title != null) item.title = update.title
  if (update.kind != null) item.toolKind = update.kind
  if (update.status != null) item.status = update.status
  if (update.content != null) item.content = update.content
  if (update.locations != null) item.locations = update.locations
  if (update.rawInput !== undefined) item.rawInput = update.rawInput
  if (update.rawOutput !== undefined) item.rawOutput = update.rawOutput
}

export function applyAcpUpdate(conversation: Conversation, update: SessionUpdate, model?: string) {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const item = assistant(conversation, update.messageId, model)
      appendContent(item, update.content)
      break
    }
    case "agent_thought_chunk": {
      const item = assistant(conversation, update.messageId, model)
      if (update.content.type === "text") item.reasoning = `${item.reasoning ?? ""}${update.content.text}`
      break
    }
    case "tool_call":
    case "tool_call_update":
      updateTool(conversation, update)
      break
    case "config_option_update":
      conversation.configOptions = update.configOptions
      break
    case "session_info_update":
      if (typeof update.title === "string" && update.title.trim()) conversation.title = update.title
      break
    case "usage_update": {
      const item = lastAssistant(conversation)
      if (item) item.usage = {
        totalTokens: update.used,
        contextSize: update.size,
      }
      break
    }
    default:
      break
  }
}
