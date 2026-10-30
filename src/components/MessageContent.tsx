import { defineComponent, ref, type PropType } from "vue"
import { useGpuix, type EventPayload } from "@gpuiv/vue"
import { markdownTheme, palette } from "../theme"
import { ContextMenu } from "./ContextMenu"
import { copyImage } from "../services/attachments"

export function contentParts(source: string): Array<{ text: string; image?: string; alt?: string }> {
  const parts: Array<{ text: string; image?: string; alt?: string }> = []
  let lines: string[] = [], fence = ""
  for (const line of source.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (marker) { if (!fence) fence = marker[1]!; else if (marker[1]![0] === fence[0] && marker[1]!.length >= fence.length) fence = ""; lines.push(line); continue }
    const match = !fence && line.match(/^\s*!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)\s*$/)
    if (match) {
      if (lines.length) parts.push({ text: lines.join("\n") })
      lines = []; parts.push({ text: line, image: match[2], alt: match[1] })
    } else lines.push(line)
  }
  if (lines.length) parts.push({ text: lines.join("\n") })
  return parts
}
export const MessageContent = defineComponent({
  props: { source: { type: String, required: true }, onLinkClick: { type: Function as PropType<(event: EventPayload) => void>, required: true } },
  setup(props) {
    const { renderer } = useGpuix()
    const menu = ref<number | null>(null)
    const notice = ref("")
    async function copy(source: string) {
      try { if (!renderer) return; await copyImage(source, renderer); notice.value = "图片已复制" }
      catch (error) { notice.value = `复制图片失败：${String(error)}` }
    }
    return () => <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {contentParts(props.source).map((part, index) => part.image ? <div key={index} style={{ position: "relative", flexShrink: 0, marginTop: 8, marginBottom: 8 }}>
        <div style={{ width: "100%", height: 320, minHeight: 320, flexShrink: 0, overflow: "hidden", borderRadius: 8 }}>
          <img src={part.image} alt={part.alt} objectFit="contain" onContextMenu={() => { menu.value = index }}
            style={{ width: 640, height: 320, maxWidth: "100%", flexShrink: 0, userSelect: "none" }} />
        </div>
        {menu.value === index ? <ContextMenu close={() => { menu.value = null }} actions={[
          { label: "复制图片", run: () => { void copy(part.image!) } },
          { label: "复制图片地址", run: () => renderer?.writeClipboardText?.(part.image!) },
        ]} /> : null}
      </div> : <markdown key={index} source={part.text} theme={markdownTheme} style={{ userSelect: "text" }} onLinkClick={props.onLinkClick} />)}
      {notice.value ? <text role="status" style={{ fontSize: 12, color: palette.muted }}>{notice.value}</text> : null}
    </div>
  },
})
