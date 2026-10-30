import { createHash } from "node:crypto"
import { mkdir, writeFile, rename, unlink, chmod } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import manifest from "../../package.json"

export const currentVersion = manifest.version
const repository = "https://github.com/liuyanghejerry/mini-dsh"
const api = "https://api.github.com/repos/liuyanghejerry/mini-dsh/releases/latest"
export interface AppRelease { version: string; url: string; assetUrl: string; checksumUrl: string; filename: string; size: number }
export function newerVersion(candidate: string, current: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(candidate) || !/^\d+\.\d+\.\d+$/.test(current)) return false
  const a = candidate.split(".").map(Number), b = current.split(".").map(Number)
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i]! > b[i]! }
  return false
}
export function parseRelease(value: unknown, current = currentVersion): AppRelease | undefined {
  if (!value || typeof value !== "object") throw new Error("更新响应无效")
  const data = value as Record<string, unknown>
  if (data.draft || data.prerelease) return
  const version = typeof data.tag_name === "string" ? data.tag_name.replace(/^v/, "") : ""
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("更新版本号无效")
  if (!newerVersion(version, current)) return
  const filename = `mini-dsh-${version}-linux-x86_64.AppImage`
  const assets = Array.isArray(data.assets) ? data.assets as Array<Record<string, unknown>> : []
  const asset = assets.find(item => item.name === filename)
  const sums = assets.find(item => item.name === "SHA256SUMS")
  const prefix = `${repository}/releases/download/${data.tag_name}/`
  if (!asset || !sums || typeof asset.browser_download_url !== "string" || !asset.browser_download_url.startsWith(prefix) || typeof sums.browser_download_url !== "string" || !sums.browser_download_url.startsWith(prefix)) throw new Error("该版本缺少 AppImage 或校验文件")
  if (typeof asset.size !== "number" || asset.size <= 0 || asset.size > 1024 ** 3) throw new Error("更新包大小无效")
  return { version, filename, size: asset.size, url: `${repository}/releases/tag/${data.tag_name}`, assetUrl: asset.browser_download_url, checksumUrl: sums.browser_download_url }
}
export async function checkUpdate(signal?: AbortSignal): Promise<AppRelease | undefined> {
  const response = await fetch(api, { headers: { Accept: "application/vnd.github+json", "User-Agent": "mini-dsh" }, signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) })
  if (response.status === 404) return
  if (!response.ok) throw new Error(`检查更新失败 (${response.status})`)
  return parseRelease(await response.json())
}
export function verifyDownload(bytes: Uint8Array, sums: string, filename: string, size: number) {
  const entry = sums.split(/\r?\n/).map(line => line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)).find(match => match?.[2] === filename)
  if (!entry || bytes.byteLength !== size || createHash("sha256").update(bytes).digest("hex") !== entry[1]!.toLowerCase()) throw new Error("更新包校验失败，未替换应用")
}
export async function downloadUpdate(release: AppRelease, progress: (fraction: number) => void, signal: AbortSignal): Promise<string> {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(15 * 60 * 1000)])
  const sumsResponse = await fetch(release.checksumUrl, { signal: timeout })
  if (!sumsResponse.ok) throw new Error("无法读取更新校验文件")
  const sums = await sumsResponse.text()
  const response = await fetch(release.assetUrl, { signal: timeout })
  if (!response.ok || !response.body) throw new Error("更新下载失败")
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > release.size) throw new Error("更新包大小不匹配")
      chunks.push(value); progress(received / release.size)
    }
  } finally { await reader.cancel() }
  const bytes = Buffer.concat(chunks)
  verifyDownload(bytes, sums, release.filename, release.size)
  const directory = join(homedir(), ".cache", "mini-dsh", "updates")
  await mkdir(directory, { recursive: true })
  const destination = join(directory, release.filename)
  const temporary = `${destination}.${crypto.randomUUID()}.part`
  try { await writeFile(temporary, bytes, { mode: 0o755 }); await rename(temporary, destination) }
  finally { await unlink(temporary).catch(() => {}) }
  return destination
}
export async function installUpdate(download: string, appImage: string): Promise<void> {
  const { copyFile, lstat } = await import("node:fs/promises")
  if (!appImage.startsWith("/") || !(await lstat(appImage)).isFile()) throw new Error("当前 AppImage 路径无效，请手动安装更新")
  const temporary = join(dirname(appImage), `.mini-dsh-update-${crypto.randomUUID()}`)
  try { await copyFile(download, temporary); await chmod(temporary, 0o755); await rename(temporary, appImage) }
  finally { await unlink(temporary).catch(() => {}) }
}
