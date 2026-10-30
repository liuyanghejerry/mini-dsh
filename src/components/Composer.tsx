import { activeFileMention, insertFileMention, searchWorkspaceFiles, type FileSearchResult } from "../services/file-mentions"
import { filterCommands, slashQuery } from "../services/slash-commands"
import type { AvailableCommand } from "@agentclientprotocol/sdk"
import { fileURLToPath } from "node:url"
import { ContextMenu } from "./ContextMenu"
import { attachment, clipboardImage, type Attachment } from "../services/attachments"
import { formatSessionMetrics } from "../services/session-metrics"
import { defineComponent, ref, computed, nextTick, watch, type PropType } from "vue"
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
    const selection = ref<[number, number]>([props.store.draft.value.length, props.store.draft.value.length])
    const externalSelection = ref<[number, number] | undefined>()
    const hasSelection = computed(() => selection.value[0] !== selection.value[1])
    const fileIndex = ref(0)
    const filesDismissed = ref(false)
    const fileResults = ref<FileSearchResult>({ paths: [], truncated: false })
    const filesLoading = ref(false)
    const filesError = ref("")
    const fileRetry = ref(0)
    const fileToken = computed(() => selection.value[0] === selection.value[1]
      ? activeFileMention(props.store.draft.value, selection.value[0]) : undefined)
    const fileMenu = computed(() => !!fileToken.value && !filesDismissed.value && !composing.value && !props.store.isStreaming.value)
    watch(() => props.store.activeId.value, () => {
      const end = props.store.draft.value.length
      selection.value = [end, end]
      externalSelection.value = undefined
    })
    watch(() => [props.store.activeId.value, props.store.draft.value, ...selection.value], () => {
      filesDismissed.value = false
    }, { flush: "sync" })
    watch([() => props.store.activeId.value, () => fileToken.value?.query, fileMenu, fileRetry], (_, __, cleanup) => {
      const abort = new AbortController()
      fileResults.value = { paths: [], truncated: false }
      filesError.value = ""
      fileIndex.value = 0
      filesLoading.value = fileMenu.value
      if (!fileMenu.value) return
      const conversation = props.store.active.value
      const query = fileToken.value!.query
      const timer = setTimeout(() => {
        void searchWorkspaceFiles(conversation.cwd, conversation.dshHome, query, abort.signal).then(result => {
          if (!abort.signal.aborted) fileResults.value = result
        }).catch(cause => {
          if (!abort.signal.aborted) filesError.value = cause instanceof Error ? cause.message : String(cause)
        }).finally(() => {
          if (!abort.signal.aborted) filesLoading.value = false
        })
      }, 150)
      cleanup(() => { clearTimeout(timer); abort.abort() })
    }, { immediate: true })
    function chooseFile(path: string) {
      const token = fileToken.value
      if (!token) return
      const inserted = insertFileMention(props.store.draft.value, token, path)
      if (!inserted) return
      props.store.draft.value = inserted.text
      selection.value = [inserted.cursor, inserted.cursor]
      externalSelection.value = [...selection.value]
      focus()
    }
    function changeDraft(value: string) {
      // Change and selection events can arrive separately. Infer the edit end
      // until the native selection event supplies the exact cursor position.
      const previous = props.store.draft.value
      if (previous === value) return
      let suffix = 0
      while (suffix < Math.min(previous.length, value.length) && previous[previous.length - 1 - suffix] === value[value.length - 1 - suffix]) suffix++
      const cursor = value.length - suffix
      selection.value = [cursor, cursor]
      props.store.draft.value = value
    }
    const commandIndex = ref(0)
    const commandsDismissed = ref(false)
    const commandQuery = computed(() => slashQuery(props.store.draft.value))
    const commandMenu = computed(() => commandQuery.value !== undefined && !commandsDismissed.value && !props.store.isStreaming.value)
    const matchingCommands = computed(() => filterCommands(props.store.commands.value, commandQuery.value ?? ""))
    watch(() => [props.store.activeId.value, props.store.draft.value], () => {
      commandIndex.value = 0
      commandsDismissed.value = false
    }, { flush: "sync" })
    watch([() => props.store.activeId.value, () => commandQuery.value !== undefined], () => {
      if (commandQuery.value !== undefined) void props.store.loadCommands()
    }, { immediate: true })
    watch(matchingCommands, commands => {
      commandIndex.value = Math.min(commandIndex.value, Math.max(0, commands.length - 1))
    })
    function chooseCommand(command: AvailableCommand) {
      const value = `/${command.name} `
      props.store.draft.value = value
      selection.value = [value.length, value.length]
      externalSelection.value = [...selection.value]
      focus()
    }
    function onKeyDown(event: EventPayload) {
      if (composing.value) return
      const key = event.key?.toLowerCase()
      if (fileMenu.value) {
        if (key === "escape") filesDismissed.value = true
        else if (fileResults.value.paths.length && (key === "down" || key === "arrowdown" || key === "up" || key === "arrowup")) {
          const step = key === "down" || key === "arrowdown" ? 1 : -1
          fileIndex.value = (fileIndex.value + step + fileResults.value.paths.length) % fileResults.value.paths.length
        }
      } else if (commandMenu.value) {
        if (key === "escape") commandsDismissed.value = true
        else if (matchingCommands.value.length && (key === "down" || key === "arrowdown" || key === "up" || key === "arrowup")) {
          const step = key === "down" || key === "arrowdown" ? 1 : -1
          commandIndex.value = (commandIndex.value + step + matchingCommands.value.length) % matchingCommands.value.length
        }
      }
      if (key === "v" && (event.modifiers?.ctrl || event.modifiers?.cmd) && renderer?.readClipboardImage?.()) void paste()
    }
    function submitFromKeyboard(value: string) {
      if (composing.value) return
      if (fileMenu.value) {
        if (filesLoading.value) return
        const path = fileResults.value.paths[fileIndex.value]
        if (path) { chooseFile(path); return }
      }
      if (commandMenu.value && props.store.active.value.commandsLoading) return
      const command = matchingCommands.value[commandIndex.value]
      if (commandMenu.value && command) chooseCommand(command)
      else submit(value)
    }
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
          {fileMenu.value ? <div testId="file-mention-menu" style={{ padding: 12, gap: 6, display: "flex", flexDirection: "column" }}>
            <text style={{ fontSize: 12, color: palette.muted }}>工作区文件 · Alt+↑↓ 选择 · Enter 引用 · Esc 关闭</text>
            {filesLoading.value ? <text style={{ fontSize: 12, color: palette.muted }}>正在搜索文件…</text> : null}
            {filesError.value ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <text role="alert" style={{ fontSize: 12, color: palette.error }}>{`文件搜索失败：${filesError.value}`}</text>
              <Button type="text" size="small" onClick={() => { fileRetry.value++ }}>{{ default: () => <text>重试</text> }}</Button>
            </div> : null}
            {!filesLoading.value && !filesError.value && !fileResults.value.paths.length
              ? <text style={{ fontSize: 12, color: palette.muted }}>没有匹配的文件</text> : null}
            {fileResults.value.paths.slice(Math.max(0, fileIndex.value - 5), Math.max(6, fileIndex.value + 1)).map(path =>
              <Button testId={`file-mention-${path}`} type={fileResults.value.paths[fileIndex.value] === path ? "primary" : "text"}
                size="small" style={{ width: "100%", minWidth: 0 }} onClick={() => chooseFile(path)}>
                {{ default: () => <text style={{ width: "100%", minWidth: 0, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{path}</text> }}
              </Button>)}
            {fileResults.value.paths.length >= 6 ? <text style={{ fontSize: 11, color: palette.muted }}>继续输入筛选，或用 Alt+↑↓ 浏览（最多显示 20 项）</text> : null}
            {fileResults.value.truncated ? <text style={{ fontSize: 11, color: palette.muted }}>工作区较大，仅搜索前 50,000 个文件；可手动输入完整路径。</text> : null}
          </div> : null}
          {commandMenu.value ? <div testId="slash-menu" style={{ padding: 12, gap: 6, display: "flex", flexDirection: "column" }}>
            <text style={{ fontSize: 12, color: palette.muted }}>技能与命令 · Alt+↑↓ 选择 · Enter 填入 · Esc 关闭</text>
            {store.active.value.commandsLoading ? <text style={{ fontSize: 12, color: palette.muted }}>正在加载技能…</text> : null}
            {store.active.value.commandsError ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <text role="alert" style={{ fontSize: 12, color: palette.error }}>{`技能加载失败：${store.active.value.commandsError}`}</text>
              <Button size="small" type="text" onClick={() => { void store.loadCommands() }}>{{ default: () => <text>重试</text> }}</Button>
            </div> : null}
            {!store.active.value.commandsLoading && !store.active.value.commandsError && !matchingCommands.value.length
              ? <text style={{ fontSize: 12, color: palette.muted }}>{store.commands.value.length ? "没有匹配的技能或命令" : "当前会话没有可用技能或命令"}</text> : null}
            {matchingCommands.value.slice(Math.max(0, commandIndex.value - 5), Math.max(6, commandIndex.value + 1)).map(command =>
              <Button testId={`slash-command-${command.name}`} type={matchingCommands.value[commandIndex.value] === command ? "primary" : "text"}
                size="small" style={{ width: "100%", minWidth: 0 }} onClick={() => chooseCommand(command)}>
                {{ default: () => <text style={{ width: "100%", minWidth: 0, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{`/${command.name}  ${command.description}${command.input?.hint ? ` · ${command.input.hint}` : ""}`}</text> }}
              </Button>)}
            {matchingCommands.value.length > 6 ? <text style={{ fontSize: 11, color: palette.muted }}>{`共 ${matchingCommands.value.length} 项，继续输入筛选或用 Alt+↑↓ 浏览`}</text> : null}
          </div> : null}
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
            onKeyDown={onKeyDown} value={store.draft.value} minRows={1} maxRows={5} autoFocus
            placeholder="输入任务，/ 选择技能，@ 引用文件…" placeholderColor="#b5aa99" theme={editorTheme}
            onChange={(event: EventPayload) => changeDraft(event.value ?? "")}
            onSubmit={(event: EventPayload) => submitFromKeyboard(event.value ?? store.draft.value)}
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
