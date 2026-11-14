export type ShortcutAction = "new" | "global-search" | "conversation-search" | "export" | "settings" | "next" | "previous" | "stop"

interface ShortcutInput {
  key?: string
  defaultPrevented?: boolean
  modifiers?: { ctrl?: boolean; cmd?: boolean; shift?: boolean }
}

export interface ShortcutEvent extends ShortcutInput {
  preventDefault(): void
  stopPropagation(): void
}

export function shortcutAction(event: ShortcutInput, options: { blocked: boolean; streaming: boolean }): ShortcutAction | null {
  if (event.defaultPrevented) return null
  const key = event.key?.toLowerCase()
  const command = Boolean(event.modifiers?.ctrl || event.modifiers?.cmd)
  if (command && key === ",") return "settings"
  if (options.blocked) return null
  if (command && key === "n") return "new"
  if (command && key === "k") return "global-search"
  if (command && key === "f") return "conversation-search"
  if (command && key === "e") return "export"
  if (command && key === "tab") return event.modifiers?.shift ? "previous" : "next"
  if (!command && key === "escape" && options.streaming) return "stop"
  return null
}
