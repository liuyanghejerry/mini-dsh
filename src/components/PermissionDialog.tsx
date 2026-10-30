import { defineComponent, type PropType } from "vue"
import { Button, Icon, Modal, Tag } from "@gpuiv/animal-island"
import type { PendingPermission } from "../state/chat"
import { palette } from "../theme"

function toolDetail(request: PendingPermission["request"]): string {
  const input = request.toolCall.rawInput
  return input === undefined ? "dsh 未提供参数详情" : JSON.stringify(input, null, 2).slice(0, 2000)
}

export const PermissionDialog = defineComponent({
  props: {
    request: { type: Object as PropType<PendingPermission | null>, default: null },
    onRespond: { type: Function as PropType<(optionId?: string) => void>, required: true },
  },
  setup(props) {
    return () => {
      const pending = props.request
      if (!pending) return null
      const request = pending.request
      return <Modal open title="需要你的许可" width={520} variant="default" typewriter={false} footer={null}
        onClose={() => props.onRespond()} {...{ "onUpdate:open": (open: boolean) => { if (!open) props.onRespond() } }}>
        {{ default: () => <div style={{ userSelect: "none", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Icon name="Tree" size={28} />
            <text style={{ fontSize: 13, lineHeight: 20, color: palette.body }}>dsh 希望执行以下工具操作。只有你明确选择后，才会继续。</text>
          </div>
          <div style={{ padding: 14, borderRadius: 16, backgroundColor: palette.mintPale }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <text style={{ flexGrow: 1, fontSize: 14, fontWeight: 800, color: palette.ink }}>{request.toolCall.title ?? "工具调用"}</text>
              <Tag size="small" variant="soft">{{ default: () => <text>{request.toolCall.kind ?? "other"}</text> }}</Tag>
            </div>
            <text style={{ userSelect: "text", marginTop: 8, fontSize: 11, lineHeight: 18, color: palette.muted }}>{toolDetail(request)}</text>
          </div>
          <text style={{ marginTop: 14, fontSize: 12, lineHeight: 20, color: palette.muted }}>许可只适用于 dsh 提供的选项，不会自动批准后续操作。</text>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            {request.options.map(option => <Button key={option.optionId} testId={`permission-${option.optionId}`}
              type={option.kind.startsWith("allow") ? "primary" : "text"} size="small"
              onClick={() => props.onRespond(option.optionId)}>{{ default: () => <text>{option.name}</text> }}</Button>)}
            <Button testId="permission-cancel" type="text" size="small" onClick={() => props.onRespond()}>{{ default: () => <text>取消</text> }}</Button>
          </div>
        </div> }}
      </Modal>
    }
  },
})
