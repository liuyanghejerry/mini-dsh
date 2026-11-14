import type { Diff } from "@agentclientprotocol/sdk"

export interface DiffPatch {
  patch: string
  additions: number
  deletions: number
}

type Line = { kind: " " | "-" | "+"; text: string; oldLine: number; newLine: number }

function lines(text: string): string[] {
  const result = text.split("\n")
  if (result.at(-1) === "") result.pop()
  return result
}

function changedLines(oldText: string, newText: string): Line[] {
  const before = lines(oldText)
  const after = lines(newText)
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
  const oldEnd = before.length - suffix
  const newEnd = after.length - suffix
  const operations: Array<Line["kind"]> = [...Array(prefix).fill(" ")]
  const oldMiddle = before.slice(prefix, oldEnd)
  const newMiddle = after.slice(prefix, newEnd)
  if (oldMiddle.length * newMiddle.length <= 1_000_000) {
    const width = newMiddle.length + 1
    const lcs = new Uint32Array((oldMiddle.length + 1) * width)
    for (let oldIndex = oldMiddle.length - 1; oldIndex >= 0; oldIndex--) {
      for (let newIndex = newMiddle.length - 1; newIndex >= 0; newIndex--) {
        lcs[oldIndex * width + newIndex] = oldMiddle[oldIndex] === newMiddle[newIndex]
          ? lcs[(oldIndex + 1) * width + newIndex + 1]! + 1
          : Math.max(lcs[(oldIndex + 1) * width + newIndex]!, lcs[oldIndex * width + newIndex + 1]!)
      }
    }
    let oldIndex = 0, newIndex = 0
    while (oldIndex < oldMiddle.length || newIndex < newMiddle.length) {
      if (oldIndex < oldMiddle.length && newIndex < newMiddle.length && oldMiddle[oldIndex] === newMiddle[newIndex]) {
        operations.push(" "); oldIndex++; newIndex++
      } else if (oldIndex < oldMiddle.length && (newIndex === newMiddle.length
        || lcs[(oldIndex + 1) * width + newIndex]! >= lcs[oldIndex * width + newIndex + 1]!)) {
        operations.push("-"); oldIndex++
      } else {
        operations.push("+"); newIndex++
      }
    }
  } else {
    operations.push(...Array(oldMiddle.length).fill("-"), ...Array(newMiddle.length).fill("+"))
  }
  operations.push(...Array(suffix).fill(" "))
  const result: Line[] = []
  let oldLine = 1, newLine = 1, oldIndex = 0, newIndex = 0
  for (const kind of operations) {
    const text = kind === "+" ? after[newIndex]! : before[oldIndex]!
    result.push({ kind, text, oldLine, newLine })
    if (kind !== "+") { oldLine++; oldIndex++ }
    if (kind !== "-") { newLine++; newIndex++ }
  }
  return result
}

export function createDiffPatch(diff: Pick<Diff, "path" | "oldText" | "newText">): DiffPatch {
  const allLines = changedLines(diff.oldText ?? "", diff.newText)
  const additions = allLines.filter(line => line.kind === "+").length
  const deletions = allLines.filter(line => line.kind === "-").length
  if (!additions && !deletions) return { patch: "", additions: 0, deletions: 0 }
  const changed = allLines.map((line, index) => line.kind === " " ? -1 : index).filter(index => index >= 0)
  const ranges: Array<[number, number]> = []
  for (const index of changed) {
    const start = Math.max(0, index - 3)
    const end = Math.min(allLines.length, index + 4)
    const previous = ranges.at(-1)
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end)
    else ranges.push([start, end])
  }
  const output = [`diff --git a${diff.path} b${diff.path}`, `--- a${diff.path}`, `+++ b${diff.path}`]
  for (const [start, end] of ranges) {
    const hunk = allLines.slice(start, end)
    const oldCount = hunk.filter(line => line.kind !== "+").length
    const newCount = hunk.filter(line => line.kind !== "-").length
    const first = hunk[0]!
    const oldStart = oldCount ? first.oldLine : Math.max(0, first.oldLine - 1)
    const newStart = newCount ? first.newLine : Math.max(0, first.newLine - 1)
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...hunk.map(line => `${line.kind}${line.text}`))
  }
  return { patch: output.join("\n"), additions, deletions }
}
