import { readFile, stat, mkdir, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { homedir } from "node:os"
import sharp from "sharp"
import type { ContentBlock } from "@agentclientprotocol/sdk"
import type { NativeRenderer } from "@gpuiv/vue"
export interface Attachment { path: string; name: string; image: boolean }
export async function attachment(path: string): Promise<Attachment> {
  const absolute = resolve(path)
  if (!(await stat(absolute)).isFile()) throw new Error("只能添加文件")
  return { path: absolute, name: basename(absolute), image: /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(absolute) }
}
export async function clipboardImage(renderer: NativeRenderer): Promise<Attachment | undefined> {
  const image = renderer.readClipboardImage?.()
  if (!image) return
  const directory = join(homedir(), ".cache", "mini-dsh", "attachments")
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${crypto.randomUUID()}.png`)
  await writeFile(path, await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer())
  return attachment(path)
}
export async function attachmentBlocks(files: Attachment[]): Promise<ContentBlock[]> {
  return Promise.all(files.map(async file => {
    if (file.image) return { type: "image" as const, data: (await sharp(file.path).png().toBuffer()).toString("base64"), mimeType: "image/png" }
    return { type: "resource_link" as const, uri: pathToFileURL(file.path).href, name: file.name }
  }))
}
export async function copyImage(source: string, renderer: NativeRenderer): Promise<void> {
  if (!renderer.writeClipboardImage) throw new Error("当前运行时不支持图片剪贴板")
  let bytes: Buffer
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`图片读取失败 (${response.status})`)
    bytes = Buffer.from(await response.arrayBuffer())
  } else if (source.startsWith("data:")) {
    const comma = source.indexOf(",")
    bytes = source.slice(0, comma).endsWith(";base64") ? Buffer.from(source.slice(comma + 1), "base64") : Buffer.from(decodeURIComponent(source.slice(comma + 1)))
  } else bytes = await readFile(source.startsWith("file:") ? fileURLToPath(source) : source)
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  renderer.writeClipboardImage(data, info.width, info.height)
}
