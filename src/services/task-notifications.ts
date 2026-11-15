import type { Conversation } from "../types"
import { lastAssistant } from "./dsh-events"

export type TaskNoticeKind = "completed" | "failed" | "permission"
export interface TaskNotice {
  conversationId: string
  title: string
  body: string
  kind: TaskNoticeKind
}

export class TaskNotificationTracker {
  private readonly states = new Map<string, { running: boolean; permission: boolean }>()

  constructor(conversations: readonly Conversation[]) {
    for (const conversation of conversations) this.states.set(conversation.id, { running: conversation.running, permission: conversation.permissionPending })
  }

  update(conversations: readonly Conversation[], activeId: string): TaskNotice[] {
    const notices: TaskNotice[] = []
    const present = new Set<string>()
    for (const conversation of conversations) {
      present.add(conversation.id)
      const previous = this.states.get(conversation.id)
      const background = conversation.id !== activeId
      let kind: TaskNoticeKind | undefined
      if (background && conversation.permissionPending && !previous?.permission) kind = "permission"
      else if (background && previous?.running && !conversation.running && !conversation.permissionPending) {
        const status = lastAssistant(conversation)?.status
        if (status === "error") kind = "failed"
        else if (status === "done") kind = "completed"
      }
      if (kind) {
        const assistant = lastAssistant(conversation)
        const excerpt = (assistant?.error || assistant?.content || "").replace(/\s+/g, " ").trim().slice(0, 160)
        notices.push({
          conversationId: conversation.id,
          title: conversation.title,
          body: excerpt || (kind === "permission" ? "dsh 正在等待你的操作许可" : kind === "failed" ? "任务执行失败" : "任务已完成"),
          kind,
        })
      }
      this.states.set(conversation.id, { running: conversation.running, permission: conversation.permissionPending })
    }
    for (const id of this.states.keys()) if (!present.has(id)) this.states.delete(id)
    return notices
  }
}
