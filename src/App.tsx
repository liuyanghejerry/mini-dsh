import { UpdateNotice } from "./components/UpdateNotice"
import { defineComponent, onBeforeUnmount, ref, watch } from "vue"
import { Button, Tag, Tooltip, fonts, provideTheme } from "@gpuiv/animal-island"
import { promptForNewPath, useGpuix } from "@gpuiv/vue"
import { loadMiniDshFonts } from "./services/animal-fonts"
import { createChatStore } from "./state/chat"
import { Composer } from "./components/Composer"
import { Glyph } from "./components/Glyph"
import { PermissionDialog } from "./components/PermissionDialog"
import { SettingsDialog } from "./components/SettingsDialog"
import { Sidebar } from "./components/Sidebar"
import { Transcript } from "./components/Transcript"
import { WindowControls } from "./components/WindowControls"
import { palette } from "./theme"
import type { ChatMessage } from "./types"
import { TaskNotificationTracker, type TaskNotice } from "./services/task-notifications"
import { conversationFileName, conversationToMarkdown, writeConversationMarkdown } from "./services/conversation-export"
import { shortcutAction, type ShortcutEvent } from "./services/keyboard-shortcuts"

export const App = defineComponent({
  name: "MiniDshApp",
  setup() {
    const { renderer } = useGpuix()
    loadMiniDshFonts(renderer)
    provideTheme()
    const store = createChatStore()
    const settingsOpen = ref(false)
    const updates = ref<{ check: () => void } | null>(null)
    const composer = ref<{ editMessage: (message: ChatMessage) => void } | null>(null)
    const sidebar = ref<{ focusSearch: () => void } | null>(null)
    const transcript = ref<{ focusSearch: () => void } | null>(null)
    const taskNotice = ref<TaskNotice | null>(null)
    const taskTracker = new TaskNotificationTracker(store.conversations.value)
    const notificationPrefix = "mini-dsh:conversation:"
    function openTask(conversationId: string) {
      store.selectConversation(conversationId)
      taskNotice.value = null
      renderer?.activateWindow?.()
    }
    renderer?.onSystemNotificationResponse?.((_error, response) => {
      if (response.tag.startsWith(notificationPrefix)) openTask(response.tag.slice(notificationPrefix.length))
    })
    watch(() => store.conversations.value.map(conversation => [conversation.id, conversation.running, conversation.permissionPending, conversation.updatedAt] as const), () => {
      for (const notice of taskTracker.update(store.conversations.value, store.activeId.value)) {
        taskNotice.value = notice
        const title = notice.kind === "completed" ? "任务完成" : notice.kind === "failed" ? "任务失败" : "需要权限确认"
        try {
          renderer?.showSystemNotification?.({
            tag: `${notificationPrefix}${notice.conversationId}`, title: `${title} · ${notice.title}`, body: notice.body,
            actions: [{ id: "open", label: "查看会话" }],
          })
        } catch { /* The in-app notice remains available when OS notifications are unsupported. */ }
      }
    })
    const exportStatus = ref<{ text: string; error: boolean } | null>(null)
    function copyConversation() {
      if (!store.active.value.items.length) return
      renderer?.writeClipboardText?.(conversationToMarkdown(store.active.value))
      exportStatus.value = { text: "整段对话已复制到剪贴板", error: false }
    }
    async function exportConversation() {
      const conversation = store.active.value
      if (!conversation.items.length || !renderer) return
      try {
        const path = await promptForNewPath(renderer, { directory: conversation.cwd, suggestedName: conversationFileName(conversation) })
        if (!path) return
        await writeConversationMarkdown(conversation, path)
        exportStatus.value = { text: `已导出到 ${path}`, error: false }
      } catch (error) {
        exportStatus.value = { text: `导出失败：${error instanceof Error ? error.message : String(error)}`, error: true }
      }
    }
    function selectRelativeConversation(step: number) {
      const list = store.filteredConversations.value
      if (!list.length) return
      const current = list.findIndex(conversation => conversation.id === store.activeId.value)
      const next = current < 0 ? (step > 0 ? 0 : list.length - 1) : (current + step + list.length) % list.length
      store.selectConversation(list[next]!.id)
    }
    function onGlobalKeyDown(event: ShortcutEvent) {
      const action = shortcutAction(event, { blocked: settingsOpen.value || Boolean(store.pendingPermission.value), streaming: store.isStreaming.value })
      if (!action) return
      event.preventDefault()
      if (action === "settings") settingsOpen.value = !settingsOpen.value
      else if (action === "new") store.newConversation()
      else if (action === "global-search") sidebar.value?.focusSearch()
      else if (action === "conversation-search") transcript.value?.focusSearch()
      else if (action === "export") void exportConversation()
      else if (action === "next") selectRelativeConversation(1)
      else if (action === "previous") selectRelativeConversation(-1)
      else if (action === "stop") void store.stop()
    }
    onBeforeUnmount(store.dispose)
    return () => <div testId="app-root" onKeyDown={onGlobalKeyDown} style={{
      userSelect: "none", position: "relative", display: "flex", flexDirection: "row", alignItems: "stretch",
      width: "100%", height: "100%", backgroundColor: palette.cream, color: palette.body,
      borderRadius: 14, overflow: "hidden",
      fontFamily: fonts.sans,
    }}>
      <Sidebar ref={sidebar} store={store} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0, minHeight: 0, height: "100%", backgroundColor: palette.cream, borderTopRightRadius: 14, borderBottomRightRadius: 14 }}>
        <div testId="main-header" windowDragRegion style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 12, minHeight: 60, paddingLeft: 32, paddingRight: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0, gap: 5 }}>
            <text style={{ fontSize: 18, fontWeight: 800, color: palette.ink }}>{store.active.value.title}</text>
            <text testId="active-workspace" style={{ fontSize: 11, color: palette.muted, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{store.active.value.cwd}</text>
          </div>
          <Tag size="small" variant="soft" color={store.connectionMode.value === "ready" ? "app-green" : "app-orange"}>
            {{ default: () => <text>{store.connectionMode.value === "ready" ? "DSH 内核" : store.connectionMode.value === "starting" ? "DSH 启动中" : "DSH 未连接"}</text> }}
          </Tag>
          <Tooltip title="复制整段对话" placement="bottom" variant="island">
            {{ default: () => <Button testId="copy-conversation" type="text" aria-label="复制整段对话" disabled={!store.active.value.items.length} onClick={copyConversation}
              icon={<Glyph name="copy" size={17} />} style={{ width: 34, height: 34, paddingLeft: 0, paddingRight: 0 }} /> }}
          </Tooltip>
          <Tooltip title="导出 Markdown（Ctrl/Cmd+E）" placement="bottom" variant="island">
            {{ default: () => <Button testId="export-conversation" type="text" aria-label="导出 Markdown" disabled={!store.active.value.items.length} onClick={() => { void exportConversation() }}
              icon={<Glyph name="download" size={18} />} style={{ width: 34, height: 34, paddingLeft: 0, paddingRight: 0 }} /> }}
          </Tooltip>
          <Tooltip title="连接与偏好设置" placement="bottom" variant="island">
            {{ default: () => <Button testId="settings" type="text" aria-label="设置" onClick={() => { settingsOpen.value = true }}
              icon={<Glyph name="settings" size={19} />} style={{ width: 36, height: 36, paddingLeft: 0, paddingRight: 0 }} /> }}
          </Tooltip>
          {process.platform !== "darwin" ? <WindowControls /> : null}
        </div>
        <UpdateNotice ref={updates} busy={store.conversations.value.some(item => item.running)} />
        {taskNotice.value ? <div testId="background-task-notice" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0, paddingTop: 9, paddingBottom: 9, paddingLeft: 20, paddingRight: 16, backgroundColor: taskNotice.value.kind === "failed" ? palette.errorBg : palette.mintPale }}>
          <Button type="text" size="small" onClick={() => openTask(taskNotice.value!.conversationId)} style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
            {{ default: () => <text style={{ width: "100%", fontSize: 12, color: taskNotice.value!.kind === "failed" ? palette.error : palette.body, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
              {`${taskNotice.value!.kind === "completed" ? "任务完成" : taskNotice.value!.kind === "failed" ? "任务失败" : "需要权限"} · ${taskNotice.value!.title} · ${taskNotice.value!.body}`}
            </text> }}
          </Button>
          <Button type="text" size="small" aria-label="关闭任务通知" onClick={() => { taskNotice.value = null }} icon={<Glyph name="close" size={13} />} />
        </div> : null}
        {exportStatus.value ? <div testId="export-status" role={exportStatus.value.error ? "alert" : "status"} style={{ display: "flex", flexDirection: "row", alignItems: "center", flexShrink: 0, paddingTop: 8, paddingBottom: 8, paddingLeft: 20, paddingRight: 16, backgroundColor: exportStatus.value.error ? palette.errorBg : palette.mintPale }}>
          <text style={{ flexGrow: 1, userSelect: "text", fontSize: 12, color: exportStatus.value.error ? palette.error : palette.body }}>{exportStatus.value.text}</text>
          <Button type="text" size="small" aria-label="关闭导出提示" onClick={() => { exportStatus.value = null }} icon={<Glyph name="close" size={13} />} />
        </div> : null}
        {store.notice.value ? <div testId="storage-notice" role="alert" style={{ flexShrink: 0, paddingTop: 9, paddingBottom: 9, paddingLeft: 20, paddingRight: 20, backgroundColor: palette.errorBg }}>
          <text style={{ userSelect: "text", fontSize: 12, lineHeight: 18, color: palette.error }}>{store.notice.value}</text>
        </div> : null}
        <Transcript ref={transcript} conversation={store.active.value} onRetry={store.retry} onEdit={(message: ChatMessage) => composer.value?.editMessage(message)} onPrompt={store.send} onLoadOlder={store.loadOlder} />
        <Composer ref={composer} store={store} />
      </div>
      <SettingsDialog onCheckUpdates={() => updates.value?.check()} store={store} open={settingsOpen.value} onClose={() => { settingsOpen.value = false }} />
      <PermissionDialog request={store.pendingPermission.value} onRespond={store.respondPermission} />
    </div>
  },
})
