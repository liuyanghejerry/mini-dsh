import { defineComponent, type PropType } from "vue"
import type { StyleDesc } from "@gpuiv/vue"
import { palette } from "../theme"

const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  settings: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  send: '<path d="m6 11 6-6 6 6M12 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="#000" stroke="none"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.5-1L20 12M4 12l2.4 5a7 7 0 0 0 11.5-1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  minimize: '<path d="M6 12h12"/>',
  maximize: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
} as const

export type GlyphName = keyof typeof paths
const cache = new Map<GlyphName, string>()

function source(name: GlyphName): string {
  let value = cache.get(name)
  if (!value) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
    value = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    cache.set(name, value)
  }
  return value
}

export const Glyph = defineComponent({
  props: {
    name: { type: String as PropType<GlyphName>, required: true },
    size: { type: Number, default: 16 },
    color: { type: String, default: palette.body },
  },
  setup(props, { attrs }) {
    return () => <svg {...attrs} src={source(props.name)} style={{
      width: props.size,
      height: props.size,
      flexShrink: 0,
      color: props.color,
      ...(attrs.style as StyleDesc | undefined),
      pointerEvents: "none",
    }} />
  },
})
