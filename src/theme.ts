import { ANIMAL_ISLAND_FONT_FAMILIES } from "@gpuiv/animal-island"
import type { GpuixTheme } from "@gpuiv/vue"

export const palette = {
  mint: "#8bcaa5",
  mintDeep: "#438468",
  mintPale: "#e2efe3",
  cream: "#fbf8ef",
  paper: "#fffdf7",
  input: "#fff9e9",
  ink: "#654d32",
  body: "#725d42",
  muted: "#9c8d74",
  line: "#e5decd",
  teal: "#19b9a7",
  lavender: "#ece5f8",
  user: "#dfeee2",
  error: "#bd574d",
  errorBg: "#fff0e7",
} as const

export const markdownTheme: GpuixTheme = {
  appearance: "light",
  text: palette.body,
  textMuted: palette.muted,
  textFaint: palette.muted,
  textDim: palette.muted,
  border: palette.line,
  bg: palette.paper,
  accent: palette.mintDeep,
  caret: palette.teal,
  fontSans: ANIMAL_ISLAND_FONT_FAMILIES.sans,
  fontSansFallbacks: [ANIMAL_ISLAND_FONT_FAMILIES.cjk],
  codeText: "#6b638d",
  codeWash: "#f0eaf5",
  metrics: {
    mdTextSize: 15,
    mdLineHeight: 25,
    mdBlockGap: 12,
    mdHeadingSizes: [24, 20, 17, 15],
    mdHeadingLineHeights: [32, 28, 25, 23],
    mdCodePaddingX: 14,
    mdCodePaddingY: 12,
    mdCodeRadius: 12,
    codeTextSize: 13,
    codeLineHeight: 21,
  },
}

export const reasoningTheme: GpuixTheme = {
  ...markdownTheme,
  bg: "#f5f0e5",
  text: "#8c7b61",
  metrics: { ...markdownTheme.metrics, mdTextSize: 13, mdLineHeight: 21 },
}

export const editorTheme: GpuixTheme = {
  caret: palette.teal,
  text: palette.body,
  textMuted: palette.muted,
  fontSans: ANIMAL_ISLAND_FONT_FAMILIES.sans,
  fontSansFallbacks: [ANIMAL_ISLAND_FONT_FAMILIES.cjk],
}
