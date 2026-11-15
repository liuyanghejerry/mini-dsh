import { defineComponent, ref, type PropType } from "vue"
import { Button, Icon, Input, Modal, Select, Tag, activationKeys } from "@gpuiv/animal-island"
import { useGpuix, type StyleDesc } from "@gpuiv/vue"
import type { ChatStore } from "../state/chat"
import type { Conversation } from "../types"
import { palette } from "../theme"
import { Glyph } from "./Glyph"
import { ContextMenu } from "./ContextMenu"
import appLogo from "../../packaging/mini-dsh-mark.svg" with { type: "file" }

const rowStyle: StyleDesc = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  borderRadius: 14,
  marginBottom: 5,
  paddingTop: 10,
  paddingBottom: 10,
  paddingLeft: 12,
  paddingRight: 6,
}

export const Sidebar = defineComponent({
  props: { store: { type: Object as PropType<ChatStore>, required: true } },
  setup(props, { expose }) {
    const { renderer } = useGpuix()
    const searchRevision = ref(0)
    const searchAutoFocus = ref(false)
    expose({ focusSearch: () => { searchAutoFocus.value = true; searchRevision.value++ } })
    const workspaceError = ref("")
    const menuFor = ref<string | null>(null)
    const renaming = ref<Conversation | null>(null)
    const deleting = ref<Conversation | null>(null)
    const renameDraft = ref("")
    const deletingBusy = ref(false)
    function chooseWorkspace() {
      workspaceError.value = ""
      renderer?.promptForPaths?.({ files: false, directories: true, multiple: false }, (cause, result) => {
        if (cause) workspaceError.value = cause.message
        else if (result.paths?.[0]) void props.store.setWorkspace(result.paths[0]).catch(error => { workspaceError.value = String(error) })
      })
    }
    function saveRename() {
      if (renaming.value && props.store.renameConversation(renaming.value.id, renameDraft.value)) renaming.value = null
    }
    async function confirmDelete() {
      if (!deleting.value) return
      deletingBusy.value = true
      const removed = await props.store.deleteConversation(deleting.value.id)
      deletingBusy.value = false
      if (removed) deleting.value = null
    }
    return () => {
      const store = props.store
      return <div testId="sidebar" style={{
        display: "flex", flexDirection: "column", flexShrink: 0,
        width: 248, backgroundColor: palette.paper, borderTopLeftRadius: 14, borderBottomLeftRadius: 14,
      }}>
        <div testId="sidebar-header" windowDragRegion style={{
          display: "flex", alignItems: "center", flexShrink: 0, minHeight: 60,
          paddingLeft: 20, paddingRight: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img testId="app-logo" src={appLogo} alt="mini-dsh 小熊 Logo" objectFit="contain" style={{ width: 38, height: 38, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <text style={{ fontSize: 23, fontWeight: 900, color: palette.ink }}>mini dsh</text>
            </div>
          </div>
        </div>
        <div style={{ paddingTop: 20, paddingBottom: 14, paddingLeft: 16, paddingRight: 16 }}>
          <Button testId="new-chat" block type="primary" icon={<Glyph name="plus" size={15} />} onClick={store.newConversation}>{{ default: () => <text>新对话</text> }}</Button>
        </div>
        <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
          <text style={{ fontSize: 11, fontWeight: 700, color: palette.muted }}>新对话工作区</text>
          <div style={{ display: "flex", flexDirection: "row", gap: 6, marginTop: 7 }}>
            <Select testId="workspace-select" size="small" options={store.workspaceOptions.value} value={store.workspace.value}
              onChange={(value: string) => { void store.setWorkspace(value).catch(error => { workspaceError.value = String(error) }) }}
              ariaLabel="选择新对话工作区" style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }} />
            <Button testId="add-workspace" type="text" size="small" aria-label="添加工作区" onClick={chooseWorkspace}
              icon={<Glyph name="plus" size={14} />} style={{ width: 32, flexShrink: 0, paddingLeft: 0, paddingRight: 0 }} />
          </div>
          {workspaceError.value ? <text role="alert" style={{ fontSize: 11, lineHeight: 16, color: palette.error, marginTop: 5 }}>{workspaceError.value}</text> : null}
        </div>
        <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 18 }}>
          <Input key={searchRevision.value} autoFocus={searchAutoFocus.value} testId="chat-search" size="small" allowClear placeholder="搜索对话…" placeholderColor={palette.body}
            prefix={<Glyph name="search" size={14} color={palette.body} />}
            modelValue={store.query.value} onChange={(value: string) => { store.query.value = value }} />
          {store.historySearching.value ? <text style={{ fontSize: 11, color: palette.muted, marginTop: 6 }}>正在搜索官方历史…</text> : null}
          {store.historySearchError.value ? <text role="alert" style={{ fontSize: 11, lineHeight: 16, color: palette.error, marginTop: 6 }}>{store.historySearchError.value}</text> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 20, paddingBottom: 8 }}>
          <text style={{ fontSize: 11, fontWeight: 700, color: palette.muted }}>最近对话</text>
          <Tag size="small" variant="soft">{{ default: () => <text>{store.conversations.value.length}</text> }}</Tag>
        </div>
        <div testId="history-scroll" style={{ flexGrow: 1, flexBasis: 0, minHeight: 0, overflow: "scroll", paddingLeft: 10, paddingRight: 10 }}>
          {store.filteredConversations.value.length ? store.filteredConversations.value.map(conversation => {
            const selected = conversation.id === store.activeId.value
            const latest = conversation.items.findLast(item => item.kind === "message" && item.role === "assistant")
            const activity = conversation.permissionPending ? "等待权限" : conversation.running ? "执行中" : latest?.kind === "message" && latest.status === "error" ? "失败" : ""
            return <div key={conversation.id} testId={`conversation-${conversation.id}`} style={{
              ...rowStyle, backgroundColor: selected ? palette.mintPale : "transparent",
              hover: { backgroundColor: selected ? palette.mintPale : "#f1f1e6" },
            }}>
              <div role="button" tabIndex={0} aria-label={conversation.title} aria-pressed={selected}
                onClick={() => store.selectConversation(conversation.id)} onKeyDown={activationKeys(() => store.selectConversation(conversation.id))}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: 0, cursor: "pointer", paddingTop: 2, paddingBottom: 2 }}>
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <text style={{ flexGrow: 1, flexBasis: 0, minWidth: 0, fontSize: 13, fontWeight: selected ? 700 : 500, color: selected ? palette.mintDeep : palette.body, pointerEvents: "none", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{conversation.title}</text>
                  {conversation.pinned ? <Glyph name="pin" size={12} color={palette.mintDeep} /> : null}
                </div>
                <text style={{ fontSize: 11, color: activity === "失败" ? palette.error : activity ? palette.mintDeep : palette.muted, marginTop: 6, pointerEvents: "none" }}>{
                  `${activity ? `${activity} · ` : ""}${conversation.items.some(item => item.kind === "message" && item.role === "user")
                    ? `${conversation.items.filter(item => item.kind === "message" && item.role === "user").length} 轮对话`
                    : conversation.historyCached ? "开始一段新对话" : "dsh 会话 · 可继续"}`
                }</text>
              </div>
              <Button testId={`conversation-menu-${conversation.id}`} type="text" size="small" aria-label={`管理 ${conversation.title}`}
                onClick={() => { menuFor.value = conversation.id }} icon={<Glyph name="more" size={15} />}
                style={{ width: 28, height: 28, marginLeft: 4, flexShrink: 0, paddingLeft: 0, paddingRight: 0 }} />
              {menuFor.value === conversation.id ? <ContextMenu close={() => { menuFor.value = null }} actions={[
                { label: conversation.pinned ? "取消置顶" : "置顶会话", run: () => store.togglePinned(conversation.id) },
                { label: "重命名", run: () => { renaming.value = conversation; renameDraft.value = conversation.title } },
                { label: "删除会话…", run: () => { deleting.value = conversation } },
              ]} /> : null}
            </div>
          }) : <div style={{ padding: 24, alignItems: "center" }}>
            <Icon name="Search" size={34} />
            <text style={{ marginTop: 12, fontSize: 12, color: palette.muted }}>没有找到相关对话</text>
          </div>}
        </div>
        <Modal open={renaming.value !== null} title="重命名会话" width={440} variant="default" typewriter={false} footer={null}
          onClose={() => { renaming.value = null }} {...{ "onUpdate:open": (open: boolean) => { if (!open) renaming.value = null } }}>
          {{ default: () => <div>
            <Input testId="rename-conversation" modelValue={renameDraft.value} autoFocus onChange={(value: string) => { renameDraft.value = value }} onSubmit={saveRename} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <Button type="text" onClick={() => { renaming.value = null }}>{{ default: () => <text>取消</text> }}</Button>
              <Button testId="save-conversation-title" type="primary" disabled={!renameDraft.value.trim()} onClick={saveRename}>{{ default: () => <text>保存</text> }}</Button>
            </div>
          </div> }}
        </Modal>
        <Modal open={deleting.value !== null} title="删除会话" width={480} variant="default" typewriter={false} footer={null}
          onClose={() => { if (!deletingBusy.value) deleting.value = null }} {...{ "onUpdate:open": (open: boolean) => { if (!open && !deletingBusy.value) deleting.value = null } }}>
          {{ default: () => <div>
            <text style={{ fontSize: 14, lineHeight: 22, color: palette.body }}>确定删除“{deleting.value?.title}”吗？</text>
            <text style={{ fontSize: 12, lineHeight: 20, color: palette.muted, marginTop: 12 }}>
              {deleting.value?.sessionId ? "dsh 支持永久删除时将删除官方记录；不支持时只从 mini dsh 隐藏，官方记录保留。永久删除不可撤销。" : "这个尚未发送的新对话将从本地移除。"}
            </text>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
              <Button type="text" disabled={deletingBusy.value} onClick={() => { deleting.value = null }}>{{ default: () => <text>取消</text> }}</Button>
              <Button testId="confirm-delete-conversation" type="primary" loading={deletingBusy.value} onClick={() => { void confirmDelete() }}>{{ default: () => <text>确认删除</text> }}</Button>
            </div>
          </div> }}
        </Modal>
      </div>
    }
  },
})
