import "vue"
import "vue/jsx-runtime"
import type { EventPayload } from "@gpuiv/vue"

declare module "vue/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      div: any
      text: any
      svg: any
      img: any
      input: any
      textarea: any
      code: any
      diff: any
      markdown: any
      anchored: any
      canvas: any
      "virtual-list": any
    }
  }
}

declare module "vue" {
  interface ComponentCustomProps {
    children?: unknown
    role?: string
    tabIndex?: number
    "aria-label"?: string
    "aria-pressed"?: boolean
    "aria-expanded"?: boolean
    onClick?: (event: EventPayload) => void
    onKeyDown?: (event: EventPayload) => void
  }
}

declare global {
  declare module "*.bin" {
    const path: string
    export default path
  }
  declare module "*.ttf" {
    const path: string
    export default path
  }
}
