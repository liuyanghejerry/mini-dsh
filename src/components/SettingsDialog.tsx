import { currentVersion } from "../services/app-updates"
import { defineComponent, ref, watch, type PropType } from "vue"
import { Button, Icon, Input, Modal, Select, Tag } from "@gpuiv/animal-island"
import { useGpuix } from "@gpuiv/vue"
import type { ChatStore } from "../state/chat"
import { officialDshHome } from "../services/dsh-home"
import { palette } from "../theme"
import { Glyph } from "./Glyph"

export const SettingsDialog = defineComponent({
  props: {
    onCheckUpdates: { type: Function as PropType<() => void>, required: true },
    store: { type: Object as PropType<ChatStore>, required: true },
    open: { type: Boolean, default: false },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const { renderer } = useGpuix()
    const keyDraft = ref("")
    const workspaceDraft = ref("")
    const homeDraft = ref("")
    const saving = ref(false)
    const error = ref("")
    watch(() => props.open, open => {
      if (open) {
        keyDraft.value = ""
        workspaceDraft.value = props.store.workspace.value
        homeDraft.value = props.store.dshHome.value
        error.value = ""
      }
    })
    async function save() {
      saving.value = true
      error.value = ""
      try {
        await props.store.updatePreferences({
          ...(keyDraft.value.trim() ? { apiKey: keyDraft.value } : {}),
          workspace: workspaceDraft.value,
          dshHome: homeDraft.value,
        })
        props.onClose()
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause)
      } finally {
        saving.value = false
      }
    }
    async function clear() {
      await props.store.updatePreferences({ apiKey: "" })
      keyDraft.value = ""
      props.onClose()
    }
    return () => <Modal open={props.open} title="连接 dsh" width={560} variant="default" typewriter={false} footer={null}
      onClose={props.onClose} {...{ "onUpdate:open": (open: boolean) => { if (!open) props.onClose() } }}>
      {{ default: () => <div style={{ userSelect: "none", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <Icon name="Tree" size={30} />
          <text style={{ flexGrow: 1, fontSize: 13, lineHeight: 20, color: palette.body }}>由官方 dsh 管理 Agent、工具与会话。</text>
          <Tag size="small" color="app-green">{{ default: () => <text>ACP</text> }}</Tag>
        </div>
        <text style={{ fontSize: 12, fontWeight: 700, color: palette.body }}>API Key</text>
        <Input testId="api-key" type="password" modelValue={keyDraft.value} onChange={(value: string) => { keyDraft.value = value }}
          onSubmit={() => { void save() }} allowClear autoFocus placeholder={props.store.hasEnvironmentKey ? "留空使用环境变量或 dsh 凭据" : "输入 DeepSeek API Key"}
          style={{ userSelect: "text", marginTop: 10, marginBottom: 10 }} />
        <text style={{ fontSize: 12, lineHeight: 20, color: palette.muted }}>留空保留已有设置。密钥只传入 dsh 子进程，不写入界面缓存；也可使用 dsh 已保存的凭据。</text>
        <text style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: palette.body }}>新对话默认工作区</text>
        <div style={{ display: "flex", flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Input testId="workspace-input" modelValue={workspaceDraft.value} onChange={(value: string) => { workspaceDraft.value = value }} style={{ userSelect: "text", flexGrow: 1, flexBasis: 0, minWidth: 0 }} />
          <Button testId="choose-workspace" onClick={() => {
            renderer?.promptForPaths?.({ files: false, directories: true, multiple: false }, (cause, result) => {
              if (cause) error.value = cause.message
              else if (result.paths?.[0]) workspaceDraft.value = result.paths[0]
            })
          }}>{{ default: () => <text>选择目录</text> }}</Button>
        </div>
        <text style={{ marginTop: 6, fontSize: 12, lineHeight: 18, color: palette.muted }}>只影响之后新建的对话；已有会话继续使用各自的工作目录。</text>
        <text style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: palette.body }}>DSH_HOME</text>
        <Input testId="dsh-home-input" modelValue={homeDraft.value} onChange={(value: string) => { homeDraft.value = value }} style={{ userSelect: "text", marginTop: 10 }} />
        <Button testId="use-official-dsh-home" type="link" size="small" onClick={() => { homeDraft.value = officialDshHome() }}
          style={{ alignSelf: "flex-start", marginTop: 4, paddingLeft: 0, paddingRight: 0 }}>{{ default: () => <text>使用官方 ~/.dsh</text> }}</Button>
        <text style={{ marginTop: 8, fontSize: 12, lineHeight: 20, color: palette.muted }}>新用户默认复用官方目录，凭据、配置和会话由 dsh 管理。已有缓存不会自动搬移；切换后重启应用生效，旧目录会话保留。</text>
        <text style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: palette.body }}>默认推理档位</text>
        <Select testId="reasoning-select" size="small" value={props.store.reasoning.value}
          options={props.store.reasoningOptions.value.length ? props.store.reasoningOptions.value.map(option => ({ key: option.key, label: option.label })) : [
            { key: "off", label: "关闭" }, { key: "low", label: "低" }, { key: "high", label: "高" }, { key: "max", label: "最高" },
          ]} onChange={(value: string) => { void props.store.setReasoning(value) }} style={{ marginTop: 10 }} />
        {error.value ? <text role="alert" style={{ userSelect: "text", marginTop: 12, fontSize: 12, lineHeight: 20, color: palette.error }}>{error.value}</text> : null}
        <Button type="link" size="small" onClick={() => renderer?.openUrl?.("https://platform.deepseek.com/api_keys")}
          style={{ alignSelf: "flex-start", marginTop: 10, paddingLeft: 0, paddingRight: 0 }}>{{ default: () => <text>前往 DeepSeek 开放平台获取 Key ↗</text> }}</Button>
        <Button testId="check-updates" type="text" size="small" onClick={() => { props.onCheckUpdates(); props.onClose() }} style={{ alignSelf: "flex-start", marginTop: 12 }}>
          {{ default: () => <text>检查更新 · v{currentVersion}</text> }}
        </Button>
        <text style={{ marginTop: 18, fontSize: 12, fontWeight: 700, color: palette.body }}>快捷键</text>
        <text style={{ marginTop: 7, fontSize: 11, lineHeight: 18, color: palette.muted }}>Ctrl/Cmd+N 新对话 · Ctrl/Cmd+K 全局搜索 · Ctrl/Cmd+F 当前对话搜索</text>
        <text style={{ fontSize: 11, lineHeight: 18, color: palette.muted }}>Ctrl/Cmd+E 导出 · Ctrl/Cmd+, 设置 · Ctrl+Tab 切换会话 · Esc 停止生成</text>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <Button type="text" size="small" onClick={() => { void clear() }} icon={<Glyph name="trash" size={13} />}>{{ default: () => <text>清除本次密钥</text> }}</Button>
          <div style={{ flexGrow: 1 }} />
          <Button type="text" onClick={props.onClose}>{{ default: () => <text>取消</text> }}</Button>
          <Button testId="save-settings" type="primary" loading={saving.value} onClick={() => { void save() }} icon={<Glyph name="check" size={14} />}>{{ default: () => <text>保存设置</text> }}</Button>
        </div>
      </div> }}
    </Modal>
  },
})
