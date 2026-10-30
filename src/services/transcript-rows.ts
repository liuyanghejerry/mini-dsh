import type { TimelineItem } from "../types"

export interface ProcessGroup {
  kind: "process"
  id: string
  items: TimelineItem[]
}
export type TranscriptRow = TimelineItem | ProcessGroup

export function groupTranscript(items: readonly TimelineItem[]): TranscriptRow[] {
  const rows: TranscriptRow[] = []
  for (const item of items) {
    const process = item.kind === "tool" || (item.role === "assistant" && !item.content.trim() && item.status === "done")
    if (!process) { rows.push(item); continue }
    const previous = rows.at(-1)
    if (previous?.kind === "process") previous.items.push(item)
    else rows.push({ kind: "process", id: `process-${item.id}`, items: [item] })
  }
  return rows
}

export function processSummary(group: ProcessGroup): string {
  const tools = group.items.filter(item => item.kind === "tool")
  const failed = tools.filter(item => item.status === "failed").length
  const pending = tools.some(item => item.status === "in_progress" || item.status === "pending")
  const names = [...new Set(tools.map(item => item.title))].slice(0, 3).join("、")
  let description = ""
  for (const tool of tools) {
    try {
      const input = typeof tool.rawInput === "string" ? JSON.parse(tool.rawInput) : tool.rawInput
      if (input && typeof input === "object" && typeof input.description === "string") description = input.description
    } catch { /* Raw tool input is not always JSON. */ }
  }
  const label = description ? description.replace(/\s+/g, " ").slice(0, 120) : names
  return `${pending ? "执行中" : "执行记录"} · ${tools.length} 次工具调用${failed ? ` · ${failed} 次失败` : ""}${label ? ` · ${label}` : ` · ${group.items.length} 段思考`}`
}
