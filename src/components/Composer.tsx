import { fileURLToPath } from "node:url"
import { ContextMenu } from "./ContextMenu"
import { attachment, clipboardImage, type Attachment } from "../services/attachments"
import { formatSessionMetrics } from "../services/session-metrics"
import { defineComponent, ref, computed, nextTick, type PropType } from "vue"
import { Button, Select, Switch, Tooltip, fonts } from "@gpuiv/animal-island"
import { useGpuix, type HostNode, type EventPayload } from "@gpuiv/vue"
import type { ChatStore } from "../state/chat"
import { editorTheme, palette } from "../theme"
import { Glyph } from "./Glyph"

export const Composer = defineComponent({
  props: { store: { type: Object as PropType<ChatStore>, required: true } },
  setup(props) {
    const composing = ref(false)
    const { renderer } = useGpuix()
    const editor = ref<HostNode | null>(null)
    const menu = ref(false)
    const error = ref("")
    const pending = ref<Record<string, Attachment[]>>({})
    const files = computed(() => pending.value[props.store.activeId.value] ?? [])
    const selection = ref<[number, number]>([0, 0])
    const externalSelection = ref<[number, number] | undefined>()
    const hasSelection = computed(() => selection.value[0] !== selection.value[1])
    function focus() { void nextTick(() => { if (editor.value?.id != null) renderer?.focusElement?.(editor.value.id) }) }
    function replaceSelection(text: string) {
      const [start, end] = [...selection.value].sort((a, b) => a - b)
      const value = props.store.draft.value
      props.store.draft.value = value.slice(0, start) + text + value.slice(end)
      selection.value = [start! + text.length, start! + text.length]
      externalSelection.value = [...selection.value]
      focus()
    }
    function copy(cut = false) {
      const [start, end] = [...selection.value].sort((a, b) => a - b)
      renderer?.writeClipboardText?.(props.store.draft.value.slice(start, end))
      if (cut) replaceSelection("")
      else focus()
    }
    async function addPaths(paths: string[], id = props.store.activeId.value) {
      try {
        const added = await Promise.all(paths.map(attachment))
        pending.value[id] = [...(pending.value[id] ?? []), ...added]
        error.value = ""
      } catch (cause) { error.value = String(cause) }
    }
    function chooseFiles() {
      const id = props.store.activeId.value
      renderer?.promptForPaths?.({ files: true, directories: false, multiple: true }, (cause, result) => {
        if (cause) error.value = cause.message
        else if (result.paths) void addPaths(result.paths, id)
      })
    }
    async function paste() {
      const id = props.store.activeId.value
      try {
        if (!renderer) return
        const image = await clipboardImage(renderer)
        if (image) pending.value[id] = [...(pending.value[id] ?? []), image]
        else {
          const text = renderer.readClipboardText?.()
          if (text?.trim().split(/\r?\n/).every(line => line.startsWith("file://"))) {
            await addPaths(text.trim().split(/\r?\n/).map(url => fileURLToPath(url)), id)
          } else if (text && props.store.activeId.value === id) replaceSelection(text)
          else error.value = "剪贴板中没有可读取的文字或图片；文件可用附件按钮添加或拖入。"
        }
      } catch (cause) { error.value = String(cause) }
    }
    function submit(value: string) {
      if (composing.value) return
      const id = props.store.activeId.value
      const sent = [...files.value]
      void props.store.send(value, sent).then(ok => {
        if (ok) pending.value[id] = (pending.value[id] ?? []).filter(file => !sent.includes(file))
      })
    }
    return () => {
      const store = props.store
      const streaming = store.isStreaming.value
      const ready = Boolean(store.draft.value.trim() || files.value.length)
      return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 14, paddingLeft: 32, paddingRight: 32, paddingBottom: 16 }}>
        <div testId="composer-surface" style={{
          position: "relative", display: "flex", flexDirection: "column", width: "100%", maxWidth: 840,
          backgroundColor: palette.paper, borderRadius: 22,
          paddingTop: 12, paddingBottom: 12,
          boxShadow: { offsetX: 0, offsetY: 5, blurRadius: 20, spreadRadius: 0, color: "rgba(89,72,46,0.08)" },
        }}>
          {files.value.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 12 }}>
            {files.value.map((file, index) => <Button type="text" onClick={() => { pending.value[store.activeId.value] = files.value.filter((_, i) => i !== index) }}>
              {{ default: () => <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{file.image ? <img src={file.path} style={{ width: 32, height: 32, objectFit: "contain" }} /> : null}<text>{file.image ? "图片" : "文件"} · {file.name} ×</text></div> }}
            </Button>)}
          </div> : null}
          <textarea ref={editor} testId="composer"
            {...{ selection: externalSelection.value, interceptClipboard: true,
              onSelectionChange: (e: EventPayload) => { selection.value = [e.startIndex ?? 0, e.endIndex ?? 0]; externalSelection.value = undefined },
              onCopy: (e: EventPayload) => { selection.value = [e.startIndex ?? 0, e.endIndex ?? 0]; copy() }, onCut: (e: EventPayload) => { selection.value = [e.startIndex ?? 0, e.endIndex ?? 0]; copy(true) }, onPaste: () => { void paste() } }}
            onFileDrop={(e: EventPayload) => { if (e.paths) void addPaths(e.paths) }}
            onContextMenu={() => { menu.value = true }}
            onKeyDown={(e: EventPayload) => { if (e.key?.toLowerCase() === "v" && (e.modifiers?.ctrl || e.modifiers?.cmd)) { if (renderer?.readClipboardImage?.()) void paste() } }} value={store.draft.value} minRows={1} maxRows={5} autoFocus
            placeholder="给 dsh 一个任务，让想法慢慢生长…" placeholderColor="#b5aa99" theme={editorTheme}
            onChange={(event: EventPayload) => { store.draft.value = event.value ?? "" }}
            onSubmit={(event: EventPayload) => submit(event.value ?? store.draft.value)}
            onCompositionStart={() => { composing.value = true }} onCompositionEnd={() => { composing.value = false }}
            style={{ userSelect: "text", width: "100%", minWidth: 0, fontSize: 15, lineHeight: 24, color: palette.body, fontFamily: fonts.sans, paddingLeft: 18, paddingRight: 18, backgroundColor: "transparent", borderWidth: 0 }} />
          {menu.value ? <ContextMenu close={() => { menu.value = false }} actions={[
            { label: "剪切", disabled: !hasSelection.value, run: () => copy(true) },
            { label: "复制", disabled: !hasSelection.value, run: () => copy() },
            { label: "粘贴", run: () => { void paste() } },
            { label: "全选", run: () => { selection.value = [0, store.draft.value.length]; externalSelection.value = [...selection.value]; focus() } },
          ]} /> : null}
          {error.value ? <text role="alert" style={{ color: palette.error, fontSize: 12, paddingLeft: 12 }}>{error.value}</text> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10, paddingLeft: 12, paddingRight: 12 }}>
            <Button type="text" aria-label="添加图片或文件" onClick={chooseFiles}>{{ default: () => <text>＋ 附件</text> }}</Button>
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
        {store.sessionMetrics.value ? <text testId="session-metrics" aria-label="当前会话累计用量及平均解码速度" style={{ marginTop: 10, fontSize: 11, lineHeight: 18, color: palette.muted }}>
          {formatSessionMetrics(store.sessionMetrics.value)}
        </text> : null}
      </div>
    }
  },
})
