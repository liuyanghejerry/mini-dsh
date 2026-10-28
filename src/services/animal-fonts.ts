import { readFileSync } from "node:fs"
import { ANIMAL_ISLAND_FONT_FAMILIES, fonts } from "@gpuiv/animal-island"
import type { NativeRenderer } from "@gpuiv/vue"
import nunitoMedium from "../../node_modules/@gpuiv/animal-island/assets/fonts/AnimalIslandNunito-Medium.ttf" with { type: "file" }
import nunitoBold from "../../node_modules/@gpuiv/animal-island/assets/fonts/AnimalIslandNunito-Bold.ttf" with { type: "file" }
import nunitoBlack from "../../node_modules/@gpuiv/animal-island/assets/fonts/AnimalIslandNunito-Black.ttf" with { type: "file" }
import notoRegular from "../../node_modules/@gpuiv/animal-island/assets/fonts/AnimalIslandNotoSansSC-Regular.ttf" with { type: "file" }
import notoMedium from "../../node_modules/@gpuiv/animal-island/assets/fonts/AnimalIslandNotoSansSC-Medium.ttf" with { type: "file" }
import notoBold from "../../node_modules/@gpuiv/animal-island/assets/fonts/AnimalIslandNotoSansSC-Bold.ttf" with { type: "file" }

const sources = [nunitoMedium, nunitoBold, nunitoBlack, notoRegular, notoMedium, notoBold]
const loaded = new WeakSet<NativeRenderer>()
let files: Uint8Array[] | undefined

export function loadMiniDshFonts(renderer: NativeRenderer | null | undefined): void {
  if (!renderer?.loadFontBytes) return
  if (!loaded.has(renderer)) {
    files ??= sources.map(source => readFileSync(source))
    for (const file of files) renderer.loadFontBytes(file)
    loaded.add(renderer)
  }
  fonts.sans = ANIMAL_ISLAND_FONT_FAMILIES.sans
}
