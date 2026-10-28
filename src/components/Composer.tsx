import { defineComponent, ref, type PropType } from "vue"
import { Button, Select, Switch, Tooltip, fonts } from "@gpuiv/animal-island"
import type { EventPayload } from "@gpuiv/vue"
import type { ChatStore } from "../state/chat"
import { editorTheme, palette } from "../theme"
import { Glyph } from "./Glyph"

export const Composer = defineComponent({
  props: { store: { type: Object as PropType<ChatStore>, required: true } },
  setup(props) {
    const composing = ref(false)
    function submit(value: string) {
      if (!composing.value) void props.store.send(value)
    }
    return () => {
      const store = props.store
      const streaming = store.isStreaming.value
      const ready = Boolean(store.draft.value.trim())
      return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 14, paddingLeft: 32, paddingRight: 32, paddingBottom: 16 }}>
        <div testId="composer-surface" style={{
          display: "flex", flexDirection: "column", width: "100%", maxWidth: 840,
          backgroundColor: palette.paper, borderRadius: 22,
          paddingTop: 12, paddingBottom: 12,
          boxShadow: { offsetX: 0, offsetY: 5, blurRadius: 20, spreadRadius: 0, color: "rgba(89,72,46,0.08)" },
        }}>
          <textarea testId="composer" value={store.draft.value} minRows={1} maxRows={5} autoFocus
            placeholder="给 dsh 一个任务，让想法慢慢生长…" placeholderColor={palette.body} theme={editorTheme}
            onChange={(event: EventPayload) => { store.draft.value = event.value ?? "" }}
            onSubmit={(event: EventPayload) => submit(event.value ?? store.draft.value)}
            onCompositionStart={() => { composing.value = true }} onCompositionEnd={() => { composing.value = false }}
            style={{ width: "100%", minWidth: 0, fontSize: 15, lineHeight: 24, color: palette.body, fontFamily: fonts.sans, paddingLeft: 18, paddingRight: 18, backgroundColor: "transparent", borderWidth: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10, paddingLeft: 12, paddingRight: 12 }}>
            <Select testId="model-select" size="small" options={store.modelOptions.value.map(option => ({ key: option.key, label: option.label }))} value={store.model.value}
              disabled={streaming} onChange={(value: string) => { void store.setModel(value) }}
              ariaLabel="选择 dsh 模型" style={{ width: 184 }} />
            <Tooltip title="在 dsh 默认推理强度与关闭推理之间切换" placement="top" variant="island">
              {{ default: () => <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Switch testId="thinking-switch" size="small" checked={store.thinking.value} disabled={streaming} onChange={store.setThinking} />
                <text style={{ fontSize: 12, color: palette.body }}>深度思考</text>
              </div> }}
            </Tooltip>
            <div style={{ flexGrow: 1 }} />
            <text style={{ fontSize: 10, color: palette.muted }}>Enter 发送 · Shift+Enter 换行</text>
            <Button testId="send" type="primary" size="small" disabled={!streaming && (!ready || store.connectionMode.value === "starting")}
              icon={<Glyph name={streaming ? "stop" : "send"} size={14} />}
              onClick={streaming ? () => { void store.stop() } : () => submit(store.draft.value)} style={{ minWidth: 78 }}>{{ default: () => <text>{streaming ? "停止" : "发送"}</text> }}</Button>
          </div>
        </div>
        <text style={{ marginTop: 10, fontSize: 11, color: palette.muted }}>{
          store.connectionMode.value === "ready" ? "由 dsh 执行 · 工具操作按权限策略确认" : "正在连接 dsh · 可在设置中检查凭据与工作区"
        }</text>
      </div>
    }
  },
})
