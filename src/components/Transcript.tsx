import { defineComponent, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue"
import { Button, Card, Icon, Tag, activationKeys } from "@gpuiv/animal-island"
import { VirtualList, useGpuix, type EventPayload, type VirtualListInstance } from "@gpuiv/vue"
import type { ChatMessage, Conversation, ToolActivity } from "../types"
import { markdownTheme, palette, reasoningTheme } from "../theme"
import { Glyph } from "./Glyph"
import { resolve, isAbsolute } from "node:path"

function resolveImages(source: string, cwd: string): string {
  return source.replace(/(!\[[^\]]*\]\()([^\s)]+)(\s*(?:"[^"]*")?\))/g, (match, prefix: string, url: string, suffix: string) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url) || isAbsolute(url)) return match
    return `${prefix}${resolve(cwd, url)}${suffix}`
  })
}

const suggestions = [
  { icon: "Rocket", color: "app-teal", title: "认识 dsh", prompt: "介绍一下你正在使用的 dsh harness，以及你能调用的工具" },
  { icon: "Tree", color: "app-yellow", title: "探索工作区", prompt: "查看当前工作区的项目结构，并说明主要模块" },
  { icon: "Fish", color: "purple", title: "Vue 3 小实验", prompt: "用 Vue 3 和 TypeScript 写一个计数器" },
] as const

const EmptyState = defineComponent({
  props: { onPrompt: { type: Function as PropType<(text: string) => void>, required: true } },
  setup(props) {
    return () => <div testId="welcome-scroll" style={{ flexGrow: 1, flexBasis: 0, minHeight: 0, overflow: "scroll" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 540, padding: 36 }}>
        <Icon name="Bear" size={76} />
        <text style={{ marginTop: 16, fontSize: 29, fontWeight: 900, color: palette.ink }}>今天，想探索点什么？</text>
        <text style={{ marginTop: 12, fontSize: 14, color: palette.muted }}>把任务留在小岛上，让 dsh 带着工具一起完成。</text>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 30 }}>
          {suggestions.map(suggestion => <Card key={suggestion.title} testId={`suggestion-${suggestion.icon}`}
            role="button" tabIndex={0} aria-label={suggestion.prompt}
            onClick={() => props.onPrompt(suggestion.prompt)} onKeyDown={activationKeys(() => props.onPrompt(suggestion.prompt))}
            hoverable color={suggestion.color} style={{ width: 204, minHeight: 142, cursor: "pointer" }}>
            {{ default: () => <>
              <Icon name={suggestion.icon} size={34} />
              <text style={{ marginTop: 12, fontSize: 16, fontWeight: 800 }}>{suggestion.title}</text>
              <text style={{ marginTop: 6, fontSize: 12, lineHeight: 19 }}>{suggestion.prompt}</text>
            </> }}
          </Card>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 26 }}>
          <Tag size="small" variant="outlined" color="app-teal">{{ default: () => <text>Vue 3 + TS</text> }}</Tag>
          <Tag size="small" variant="outlined" color="purple">{{ default: () => <text>原生 GPUI</text> }}</Tag>
          <Tag size="small" variant="outlined" color="app-orange">{{ default: () => <text>dsh ACP</text> }}</Tag>
        </div>
      </div>
    </div>
  },
})

function detail(activity: ToolActivity): string {
  const text = activity.content?.flatMap(entry => {
    if (entry.type === "content" && entry.content.type === "text") return [entry.content.text]
    if (entry.type === "diff") return [entry.path]
    return []
  }).filter(Boolean).join("\n")
  const raw = text || (activity.rawInput !== undefined ? JSON.stringify(activity.rawInput, null, 2) : activity.rawOutput !== undefined ? JSON.stringify(activity.rawOutput, null, 2) : "")
  return (raw || "dsh 未提供详细输出").slice(0, 4000)
}

const ToolRow = defineComponent({
  props: { activity: { type: Object as PropType<ToolActivity>, required: true } },
  setup(props) {
    const expanded = ref(false)
    return () => {
      const activity = props.activity
      return <div testId={`tool-${activity.id}`} style={{ marginTop: 8, padding: 12, borderRadius: 13, backgroundColor: "#f5f0e5" }}>
        <div testId={`tool-toggle-${activity.id}`} role="button" tabIndex={0} aria-label="切换工具详情" aria-expanded={expanded.value}
          onClick={() => { expanded.value = !expanded.value }} onKeyDown={activationKeys(() => { expanded.value = !expanded.value })}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <Glyph name={expanded.value ? "down" : "right"} size={12} color={palette.muted} />
          <text style={{ flexGrow: 1, fontSize: 12, fontWeight: 700, color: palette.body }}>{activity.title}</text>
          <Tag size="small" variant="soft" color={activity.status === "completed" ? "app-green" : activity.status === "failed" ? "app-red" : "app-orange"}>
            {{ default: () => <text>{activity.status === "completed" ? "已完成" : activity.status === "failed" ? "失败" : activity.status === "in_progress" ? "执行中" : "等待"}</text> }}
          </Tag>
        </div>
        {expanded.value ? <text style={{ userSelect: "text", marginTop: 8, fontSize: 11, lineHeight: 18, color: palette.muted }}>{detail(activity)}</text> : null}
      </div>
    }
  },
})

const MessageRow = defineComponent({
  props: {
    message: { type: Object as PropType<ChatMessage>, required: true },
    latest: { type: Boolean, default: false },
    onRetry: { type: Function as PropType<() => void>, required: true },
    cwd: { type: String, required: true },
  },
  setup(props) {
    const { renderer } = useGpuix()
    const showReasoning = ref(props.message.status === "streaming")
    const copied = ref(false)
    let copyTimer: ReturnType<typeof setTimeout> | undefined
    onBeforeUnmount(() => { if (copyTimer) clearTimeout(copyTimer) })
    function copy() {
      renderer?.writeClipboardText?.(props.message.content)
      copied.value = true
      if (copyTimer) clearTimeout(copyTimer)
      copyTimer = setTimeout(() => { copied.value = false }, 1500)
    }
    function openLink(event: EventPayload) {
      const url = event.value ?? ""
      if (/^https?:\/\//i.test(url)) renderer?.openUrl?.(url)
    }
    return () => {
      const item = props.message
      if (item.role === "user") {
        return <div testId={`message-${item.id}`} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: "100%", paddingTop: 14, paddingBottom: 14, paddingLeft: 32, paddingRight: 32 }}>
          <div style={{ maxWidth: "82%", paddingTop: 11, paddingBottom: 11, paddingLeft: 17, paddingRight: 17, borderRadius: 18, backgroundColor: palette.user }}>
            <text style={{ userSelect: "text", fontSize: 14, lineHeight: 23, color: palette.body }}>{item.content}</text>
          </div>
          <Button testId={`copy-user-${item.id}`} type="text" size="small" aria-label={copied.value ? "已复制用户消息" : "复制用户消息"}
            onClick={copy} icon={<Glyph name={copied.value ? "check" : "copy"} size={13} />}
            style={{ height: 28, marginTop: 4, paddingLeft: 8, paddingRight: 8, fontSize: 12 }}>
            {{ default: () => <text>{copied.value ? "已复制" : "复制"}</text> }}
          </Button>
        </div>
      }
      return <div testId={`message-${item.id}`} style={{ display: "flex", flexDirection: "row", width: "100%", paddingTop: 14, paddingBottom: 14, paddingLeft: 32, paddingRight: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: palette.lavender }}>
          <Icon name="Rabbit" size={29} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0, marginLeft: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 30 }}>
            <text style={{ fontSize: 13, fontWeight: 800, color: palette.ink }}>mini dsh</text>
            <Tag size="small" color="app-teal" variant="soft">{{ default: () => <text>{item.model ?? "DSH"}</text> }}</Tag>
            {item.status === "streaming" ? <text style={{ fontSize: 11, color: palette.mintDeep }}>dsh 执行中…</text> : null}
          </div>
          {item.reasoning ? <div style={{ marginTop: 8, padding: 10, borderRadius: 13, backgroundColor: "#f5f0e5" }}>
            <div role="button" tabIndex={0} aria-label="切换思考过程" aria-expanded={showReasoning.value}
              onClick={() => { showReasoning.value = !showReasoning.value }} onKeyDown={activationKeys(() => { showReasoning.value = !showReasoning.value })}
              style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <Glyph name={showReasoning.value ? "down" : "right"} size={12} color={palette.muted} />
              <text style={{ fontSize: 12, fontWeight: 700, color: palette.muted }}>思考过程</text>
            </div>
            {showReasoning.value ? <div style={{ marginTop: 6 }}><markdown style={{ userSelect: "text" }} source={item.reasoning} theme={reasoningTheme} onLinkClick={openLink} /></div> : null}
          </div> : null}
          {item.content || item.status !== "done" ? <div style={{ display: "flex", flexDirection: "column", marginTop: 8, padding: 16, borderRadius: 17, backgroundColor: palette.paper }}>
            {item.content ? <markdown style={{ userSelect: "text" }} source={resolveImages(item.content, props.cwd)} theme={markdownTheme} onLinkClick={openLink} /> : null}
            {!item.content && item.status === "streaming" ? <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32 }}>
              <Icon name="Star" size={23} />
              <text style={{ fontSize: 13, color: palette.muted }}>{item.reasoning ? "正在整理回答…" : "等待 dsh 返回…"}</text>
            </div> : null}
            {item.status === "error" ? <div role="alert" style={{ marginTop: item.content ? 12 : 0, padding: 12, borderRadius: 12, backgroundColor: palette.errorBg }}>
              <text style={{ userSelect: "text", fontSize: 13, lineHeight: 20, color: palette.error }}>{item.error ?? "执行失败，请检查 dsh 连接后重试。"}</text>
            </div> : null}
            {item.status === "stopped" ? <text style={{ marginTop: item.content ? 10 : 0, fontSize: 12, color: palette.muted }}>已停止生成{!item.content ? "，这次没有收到内容" : "，已保留当前内容"}。</text> : null}
            {item.status === "done" || item.status === "stopped" ? <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
              {item.content ? <Button type="text" size="small" onClick={copy} icon={<Glyph name={copied.value ? "check" : "copy"} size={13} />} style={{ height: 28, paddingLeft: 8, paddingRight: 8, fontSize: 12 }}>{{ default: () => <text>{copied.value ? "已复制" : "复制"}</text> }}</Button> : null}
              {props.latest ? <Button testId="retry" type="text" size="small" onClick={props.onRetry} icon={<Glyph name="refresh" size={13} />} style={{ height: 28, paddingLeft: 8, paddingRight: 8, fontSize: 12 }}>{{ default: () => <text>重试</text> }}</Button> : null}
              <div style={{ flexGrow: 1 }} />
              {item.usage ? <text style={{ fontSize: 10, color: palette.muted }}>{`${item.usage.totalTokens} / ${item.usage.contextSize ?? "—"} tokens`}</text> : null}
            </div> : null}
          </div> : null}
        </div>
      </div>
    }
  },
})

export const Transcript = defineComponent({
  props: {
    conversation: { type: Object as PropType<Conversation>, required: true },
    onRetry: { type: Function as PropType<() => void>, required: true },
    onPrompt: { type: Function as PropType<(text: string) => void>, required: true },
    onLoadOlder: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const list = ref<VirtualListInstance | null>(null)
    const { renderer } = useGpuix()
    let visible = { start: 0, end: 0 }
    const heights = new Map<string, number>()
    const bar = ref({ total: 1, viewport: 1, offset: 0 })
    let width = 0
    let timer: ReturnType<typeof setInterval> | undefined
    function rowHeight(index: number): number {
      const item = props.conversation.items[index]
      return item ? heights.get(item.id) ?? 160 : 0
    }
    function updateScrollbar() {
      const id = list.value?.id
      const anchor = list.value?.getListScrollTop()
      if (id == null || !anchor) return
      const bounds = renderer?.getElementBounds?.(id)
      if (bounds && bounds.width !== width) {
        width = bounds.width
        heights.clear()
      }
      for (let i = visible.start; i < visible.end; i++) {
        const geometry = renderer?.getVirtualListGeometry?.(id, i)
        const item = props.conversation.items[i]
        if (item && geometry && geometry.length >= 9 && geometry[8]! > 0) heights.set(item.id, geometry[8]!)
      }
      let total = 0
      let offset = 0
      for (let i = 0; i < props.conversation.items.length; i++) {
        const height = rowHeight(i)
        total += height
        if (i < anchor.itemIndex) offset += height
      }
      const viewport = anchor.viewportHeight
      offset = anchor.atEnd ? Math.max(0, total - viewport) : Math.max(0, Math.min(total - viewport, offset + anchor.offsetInItem))
      if (bar.value.total !== total || bar.value.viewport !== viewport || bar.value.offset !== offset) bar.value = { total, viewport, offset }
    }
    onMounted(() => { timer = setInterval(updateScrollbar, 100) })
    onBeforeUnmount(() => { if (timer) clearInterval(timer) })
    watch(() => props.conversation.id, () => {
      heights.clear()
      visible = { start: 0, end: 0 }
      bar.value = { total: 1, viewport: 1, offset: 0 }
    })
    function navigate(event: EventPayload) {
      if (event.y == null || !props.conversation.items.length) return
      const id = list.value?.id
      const bounds = id == null ? null : renderer?.getElementBounds?.(id)
      if (!bounds || bounds.height <= 0) return
      const thumb = Math.min(bounds.height, Math.max(20, bounds.height * bar.value.viewport / Math.max(1, bar.value.total)))
      const fraction = Math.max(0, Math.min(1, (event.y - bounds.y - thumb / 2) / Math.max(1, bounds.height - thumb)))
      let offset = fraction * Math.max(0, bar.value.total - bar.value.viewport)
      let index = 0
      while (index < props.conversation.items.length - 1 && offset >= rowHeight(index)) offset -= rowHeight(index++)
      list.value?.scrollToItem(index, offset)
    }
    return () => {
      const conversation = props.conversation
      if (!conversation.items.length && conversation.historyCached) return <EmptyState onPrompt={props.onPrompt} />
      return <div testId="message-list" style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minHeight: 0, width: "100%" }}>
        {conversation.historyHasMore ? <div style={{ display: "flex", justifyContent: "center", flexShrink: 0, marginTop: 10 }}>
          <Button testId="load-older" type="text" size="small" loading={conversation.historyLoading} onClick={props.onLoadOlder}>
            {{ default: () => <text>加载更早消息</text> }}
          </Button>
        </div> : null}
        {!conversation.historyCached || conversation.historyError ? <div testId="history-notice" style={{ flexShrink: 0, margin: 16, marginBottom: 0, padding: 12, borderRadius: 14, backgroundColor: "#f5f0e5" }}>
          <text style={{ fontSize: 12, lineHeight: 19, color: palette.muted }}>{conversation.historyLoading && !conversation.historyCached
            ? "正在读取 dsh 历史…"
            : conversation.historyError ?? "尚未读取早期消息；新的执行与回复会显示在这里。"}</text>
        </div> : null}
        <div style={{ display: "flex", flexDirection: "row", flexGrow: 1, flexBasis: 0, minHeight: 0 }}>
        <VirtualList key={conversation.id} ref={list} itemCount={conversation.items.length} estimatedItemHeight={160} overdraw={280} alignment="bottom" followTail
          style={{ flexGrow: 1, flexBasis: 0, minHeight: 0, width: "100%" }}
          onVisibleRange={(event: EventPayload) => {
            const start = event.startIndex ?? 0
            const end = event.endIndex ?? 0
            visible = { start, end }
          }}
          renderItem={(index: number) => {
            const item = conversation.items[index]
            if (!item) return null
            if (item.kind === "tool") return <ToolRow key={item.id} activity={item} />
            return <MessageRow key={item.id} message={item} cwd={conversation.cwd} latest={index === conversation.items.length - 1} onRetry={props.onRetry} />
          }} />
        {bar.value.total > bar.value.viewport ? <div role="scrollbar" aria-label="对话滚动条" aria-orientation="vertical" onMouseDown={navigate} onMouseMove={(event: EventPayload) => { if (event.pressedButton === 0) navigate(event) }}
          style={{ width: 14, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#eee9df", cursor: "pointer" }}>
          <div style={{ flexGrow: bar.value.offset, flexBasis: 0 }} />
          <div style={{ width: 6, borderRadius: 3, backgroundColor: palette.muted, minHeight: 20,
            flexGrow: Math.min(bar.value.total, bar.value.viewport), flexBasis: 0 }} />
          <div style={{ flexGrow: Math.max(0, bar.value.total - bar.value.viewport - bar.value.offset), flexBasis: 0 }} />
        </div> : null}
        </div>
      </div>
    }
  },
})
