import type { AvailableCommand, SessionConfigOption, ToolCallContent, ToolCallLocation, ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk"

export type MessageRole = "user" | "assistant"
export type MessageStatus = "streaming" | "done" | "stopped" | "error"

export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens: number
  contextSize?: number
}

export interface ChatMessage {
  kind: "message"
  id: string
  role: MessageRole
  content: string
  reasoning?: string
  status: MessageStatus
  createdAt: number
  source?: "dsh"
  model?: string
  error?: string
  usage?: TokenUsage
}

export interface ToolActivity {
  kind: "tool"
  id: string
  title: string
  toolKind: ToolKind
  status: ToolCallStatus
  content?: ToolCallContent[]
  locations?: ToolCallLocation[]
  rawInput?: unknown
  rawOutput?: unknown
  createdAt: number
}

export type TimelineItem = ChatMessage | ToolActivity

export interface Conversation {
  id: string
  sessionId?: string
  title: string
  items: TimelineItem[]
  draft?: string
  createdAt: number
  updatedAt: number
  cwd: string
  dshHome: string
  availableCommands?: AvailableCommand[]
  skillCommands?: AvailableCommand[]
  commandsLoading?: boolean
  commandsError?: string
  configOptions: SessionConfigOption[]
  historyCached: boolean
  historyHasMore?: boolean
  historyThroughSeq?: number
  historyBeforeSeq?: number
  historyLoading?: boolean
  historyError?: string
  running: boolean
  active: boolean
  permissionPending: boolean
  preparing?: Promise<void>
  currentAssistantId?: string
  stopRequested?: boolean
}

export type PersistedConversation = Omit<Conversation,
  "availableCommands" | "skillCommands" | "commandsLoading" | "commandsError" | "running" | "active" | "permissionPending" | "preparing" | "currentAssistantId" | "stopRequested" | "configOptions" | "historyLoading" | "historyError"
>

export interface PersistedChat {
  version: 2
  activeId: string
  model: string
  reasoning: string
  workspace: string
  dshHome: string
  conversations: PersistedConversation[]
}

export interface ConfigChoice {
  key: string
  label: string
  description?: string
}
