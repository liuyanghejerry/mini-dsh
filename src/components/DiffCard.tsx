import type { Diff } from "@agentclientprotocol/sdk"
import { computed, defineComponent, ref, type PropType } from "vue"
import { Button } from "@gpuiv/animal-island"
import { useGpuix } from "@gpuiv/vue"
import { pathToFileURL } from "node:url"
import { createDiffPatch } from "../services/tool-diffs"
import { markdownTheme, palette } from "../theme"
import { Glyph } from "./Glyph"

export const DiffCard = defineComponent({
  props: { value: { type: Object as PropType<Diff>, required: true } },
  setup(props) {
    const { renderer } = useGpuix()
    const copied = ref(false)
    const result = computed(() => createDiffPatch(props.value))
    function open() {
      if (renderer?.openUrl) renderer.openUrl(pathToFileURL(props.value.path).href)
    }
    return () => <div testId={`diff-${props.value.path}`} style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", backgroundColor: palette.paper }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 5, padding: 6, backgroundColor: palette.lavender }}>
        <Button type="text" size="small" aria-label={`打开 ${props.value.path}`} onClick={open} style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
          {{ default: () => <text style={{ width: "100%", fontSize: 11, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{props.value.path}</text> }}
        </Button>
        <text style={{ fontSize: 11, color: palette.mintDeep }}>+{result.value.additions}</text>
        <text style={{ fontSize: 11, color: palette.error }}>−{result.value.deletions}</text>
        <Button type="text" size="small" aria-label="复制 Diff" icon={<Glyph name={copied.value ? "check" : "copy"} size={12} />}
          onClick={() => { renderer?.writeClipboardText?.(result.value.patch); copied.value = true }} />
      </div>
      {result.value.patch ? <diff scroll patch={result.value.patch} wordDiff theme={markdownTheme}
        style={{ width: "100%", height: 320, minHeight: 120, userSelect: "text" }} /> : null}
    </div>
  },
})
