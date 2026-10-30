import { spawn } from "node:child_process"
import { resolveDshRuntimeAssets } from "./dsh-assets"

export interface FileMentionToken { start: number; end: number; query: string; quoted: boolean }
export interface FileSearchResult { paths: string[]; truncated: boolean }

export function activeFileMention(text: string, cursor: number): FileMentionToken | undefined {
  if (cursor < 0 || cursor > text.length) return
  const before = text.slice(0, cursor)
  const match = /(?:^|\s)(@"([^"\n]*)|@([^\s"]*))$/.exec(before)
  if (!match?.[1] || match.index + match[0].length !== before.length) return
  const quoted = match[2] !== undefined
  // Replace the entire token when completing in the middle of an existing path.
  const tail = text.slice(cursor)
  const suffix = quoted ? /^[^"\n]*(?:"|$)/.exec(tail)?.[0] : /^[^\s]*/.exec(tail)?.[0]
  return { start: cursor - match[1].length, end: cursor + (suffix?.length ?? 0), query: match[2] ?? match[3] ?? "", quoted }
}

export function formatFileMention(path: string, quoted = false): string | undefined {
  if (!path || /[\u0000-\u001f\u007f-\u009f"]/.test(path)) return
  return quoted || /\s|[.,;:!?。，；：！？]$/.test(path) ? `@"${path}"` : `@${path}`
}

export function insertFileMention(text: string, token: FileMentionToken, path: string) {
  const mention = formatFileMention(path, token.quoted)
  if (!mention) return
  const insertion = `${mention} `
  return { text: text.slice(0, token.start) + insertion + text.slice(token.end).replace(/^ /, ""), cursor: token.start + insertion.length }
}

export function filterFilePaths(paths: string[], query: string, limit = 20): string[] {
  const keyword = query.replace(/^\.\//, "").toLocaleLowerCase()
  return paths.filter(path => formatFileMention(path) && path.toLocaleLowerCase().includes(keyword))
    .sort((a, b) => Number(!a.toLocaleLowerCase().startsWith(keyword)) - Number(!b.toLocaleLowerCase().startsWith(keyword)) || a.localeCompare(b))
    .slice(0, limit)
}

// The official Web fileReferences/list acquires a writer handle and conflicts
// with ACP. Discover paths locally; dsh still owns reading and permissions.
export async function searchWorkspaceFiles(cwd: string, dshHome: string, query: string, signal: AbortSignal): Promise<FileSearchResult> {
  signal.throwIfAborted()
  const executable = resolveDshRuntimeAssets(dshHome).sidecar
  const abort = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--files", "--hidden", "--null", "-g", "!.git", "-g", "!node_modules", "-g", "!.mini-dsh", "--", "."], { cwd, stdio: ["ignore", "pipe", "pipe"], signal: abort })
    const paths: string[] = []
    let pending = ""
    let truncated = false
    let errors = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      if (truncated) return
      pending += chunk
      let end: number
      while ((end = pending.indexOf("\0")) !== -1) {
        paths.push(pending.slice(0, end).replace(/^\.\//, ""))
        pending = pending.slice(end + 1)
        if (paths.length >= 50_000) {
          truncated = true
          pending = ""
          child.kill()
          break
        }
      }
    })
    child.stderr.on("data", chunk => { errors = `${errors}${String(chunk)}`.slice(-1000) })
    child.on("error", reject)
    child.on("close", code => {
      if (abort.aborted) { reject(abort.reason); return }
      if (!truncated && (code !== 0 && code !== 1 || code === 1 && errors.trim())) { reject(new Error(errors || "工作区文件搜索失败")); return }
      resolve({ paths: filterFilePaths(paths, query), truncated })
    })
  })
}
