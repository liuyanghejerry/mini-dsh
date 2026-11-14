import { basename } from "node:path"

export function collectWorkspaces(...groups: Array<Iterable<string> | undefined>): string[] {
  const paths = new Set<string>()
  for (const group of groups) {
    for (const value of group ?? []) {
      const path = value.trim()
      if (path) paths.add(path)
    }
  }
  return [...paths].slice(0, 20)
}

export function workspaceLabel(path: string): string {
  return basename(path) || path
}
