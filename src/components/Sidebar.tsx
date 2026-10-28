import { defineComponent, type PropType } from "vue"
import { Button, Icon, Input, Tag, activationKeys } from "@gpuiv/animal-island"
import type { StyleDesc } from "@gpuiv/vue"
import type { ChatStore } from "../state/chat"
import { palette } from "../theme"
import { Glyph } from "./Glyph"

const rowStyle: StyleDesc = {
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
  setup(props) {
    return () => {
      const store = props.store
      return <div testId="sidebar" style={{
        display: "flex", flexDirection: "column", flexShrink: 0,
        width: 248, backgroundColor: palette.paper,
      }}>
        <div testId="sidebar-header" windowDragRegion style={{
          display: "flex", alignItems: "center", flexShrink: 0, minHeight: 76,
          paddingLeft: 20, paddingRight: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="Bear" size={38} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <text style={{ fontSize: 23, fontWeight: 900, color: palette.ink }}>mini dsh</text>
              <text style={{ fontSize: 11, color: palette.muted }}>你的 DeepSeek 小岛</text>
            </div>
          </div>
        </div>
        <div style={{ paddingTop: 20, paddingBottom: 20, paddingLeft: 16, paddingRight: 16 }}>
          <Button testId="new-chat" block type="primary" icon={<Glyph name="plus" size={15} />} onClick={store.newConversation}>{{ default: () => <text>新对话</text> }}</Button>
        </div>
        <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 18 }}>
          <Input testId="chat-search" size="small" allowClear placeholder="搜索对话…" placeholderColor={palette.body}
            prefix={<Glyph name="search" size={14} color={palette.body} />}
            modelValue={store.query.value} onChange={(value: string) => { store.query.value = value }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 20, paddingBottom: 8 }}>
          <text style={{ fontSize: 11, fontWeight: 700, color: palette.muted }}>最近对话</text>
          <Tag size="small" variant="soft">{{ default: () => <text>{store.conversations.value.length}</text> }}</Tag>
        </div>
        <div testId="history-scroll" style={{ flexGrow: 1, flexBasis: 0, minHeight: 0, overflow: "scroll", paddingLeft: 10, paddingRight: 10 }}>
          {store.filteredConversations.value.length ? store.filteredConversations.value.map(conversation => {
            const selected = conversation.id === store.activeId.value
            return <div key={conversation.id} testId={`conversation-${conversation.id}`} style={{
              ...rowStyle, backgroundColor: selected ? palette.mintPale : "transparent",
              hover: { backgroundColor: selected ? palette.mintPale : "#f1f1e6" },
            }}>
              <div role="button" tabIndex={0} aria-label={conversation.title} aria-pressed={selected}
                onClick={() => store.selectConversation(conversation.id)} onKeyDown={activationKeys(() => store.selectConversation(conversation.id))}
                style={{ flexGrow: 1, flexBasis: 0, minWidth: 0, cursor: "pointer", paddingTop: 2, paddingBottom: 2 }}>
                <text style={{ fontSize: 13, fontWeight: selected ? 700 : 500, color: selected ? palette.mintDeep : palette.body, pointerEvents: "none" }}>{conversation.title}</text>
                <text style={{ fontSize: 11, color: palette.muted, marginTop: 6, pointerEvents: "none" }}>{
                  conversation.items.some(item => item.kind === "message" && item.role === "user")
                    ? `${conversation.items.filter(item => item.kind === "message" && item.role === "user").length} 轮对话`
                    : conversation.historyCached ? "开始一段新对话" : "dsh 会话 · 可继续"
                }</text>
              </div>
              <div testId={`delete-${conversation.id}`} role="button" tabIndex={0} aria-label={`移除 ${conversation.title}`}
                onClick={() => store.deleteConversation(conversation.id)} onKeyDown={activationKeys(() => store.deleteConversation(conversation.id))}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, marginLeft: 4, flexShrink: 0, borderRadius: 14, cursor: "pointer", hover: { backgroundColor: "#e9ddcf" } }}>
                <Glyph name="trash" size={13} color={palette.muted} />
              </div>
            </div>
          }) : <div style={{ padding: 24, alignItems: "center" }}>
            <Icon name="Search" size={34} />
            <text style={{ marginTop: 12, fontSize: 12, color: palette.muted }}>没有找到相关对话</text>
          </div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: 12, marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: "#eef3df" }}>
          <Icon name="Leaf" size={29} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <text style={{ fontSize: 12, fontWeight: 700, color: palette.body }}>轻巧，也可以很好看。</text>
            <text style={{ fontSize: 10, color: palette.muted }}>Vue 3 · TypeScript · GPUI</text>
          </div>
        </div>
      </div>
    }
  },
})
