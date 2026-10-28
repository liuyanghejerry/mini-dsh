import { defineComponent, getCurrentInstance } from "vue"
import { Button, Tooltip } from "@gpuiv/animal-island"
import { useGpuixRequired, type StyleDesc } from "@gpuiv/vue"
import { closeAllRuntimes } from "../services/dsh-runtime"
import { palette } from "../theme"
import { Glyph } from "./Glyph"

const buttonStyle: StyleDesc = {
  width: 30,
  height: 30,
  paddingLeft: 0,
  paddingRight: 0,
  borderRadius: 10,
}

export const WindowControls = defineComponent({
  name: "WindowControls",
  setup() {
    const renderer = useGpuixRequired()
    const vueApp = getCurrentInstance()?.appContext.app
    async function close() {
      await closeAllRuntimes()
      vueApp?.unmount()
      renderer.closeWindow?.()
    }
    const controls = [
      { testId: "window-minimize", label: "最小化", icon: "minimize", action: () => renderer.minimizeWindow?.() },
      { testId: "window-zoom", label: "最大化 / 还原", icon: "maximize", action: () => renderer.zoomWindow?.() },
      { testId: "window-close", label: "关闭窗口", icon: "close", action: close },
    ] as const
    return () => <div testId="window-controls" style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4, flexShrink: 0 }}>
      {controls.map(control => <Tooltip key={control.testId} title={control.label} placement="bottom" variant="island">
        {{ default: () => <Button testId={control.testId} type="text" size="small" aria-label={control.label}
          icon={<Glyph name={control.icon} size={14} color={palette.body} />}
          onClick={control.action} style={buttonStyle} /> }}
      </Tooltip>)}
    </div>
  },
})
