import { defineComponent, type PropType } from "vue"
import { FloatingLayer } from "@gpuiv/vue"
import { Button } from "@gpuiv/animal-island"
import { palette } from "../theme"
export interface MenuAction { label: string; disabled?: boolean; run: () => void }
export const ContextMenu = defineComponent({
  props: { actions: { type: Array as PropType<MenuAction[]>, required: true }, close: { type: Function as PropType<() => void>, required: true } },
  setup(props) {
    return () => <FloatingLayer side="top" align="start" sideOffset={4} role="menu" {...{ onMouseDownOutside: props.close, onKeyDown: (e: { key?: string }) => { if (e.key === "escape" || e.key === "Escape") props.close() } }}
      style={{ display: "flex", flexDirection: "column", width: 170, padding: 6, borderRadius: 10, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, userSelect: "none" }}>
      {{ default: () => props.actions.map(action => <Button type="text" disabled={action.disabled} onClick={() => { props.close(); action.run() }}>
        {{ default: () => <text>{action.label}</text> }}
      </Button>) }}
    </FloatingLayer>
  },
})
