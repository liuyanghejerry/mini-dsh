import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sharp } from "../src/services/image-codec"
import type { NativeRenderer } from "@gpuiv/vue"
import { attachment, attachmentBlocks, copyImage } from "../src/services/attachments"
import { contentParts } from "../src/components/MessageContent"
const directory = await mkdtemp(join(tmpdir(), "mini-dsh-attachments-"))
try {
  const path = join(directory, "image.png")
  await sharp({ create: { width: 2, height: 3, channels: 4, background: "#ff0000" } }).png().toFile(path)
  const document = join(directory, "测试.txt")
  await writeFile(document, "test")
  const blocks = await attachmentBlocks([await attachment(path), await attachment(document)])
  assert.equal(blocks[0]?.type, "image")
  assert.equal(blocks[1]?.type, "resource_link")
  let copied = false
  await copyImage(path, { writeClipboardImage: (data: Uint8Array, width: number, height: number) => {
    assert.equal(width, 2); assert.equal(height, 3); assert.equal(data.length, 24); copied = true
  } } as NativeRenderer)
  assert.ok(copied)
  assert.equal(contentParts("text\n![image](test.png)\nmore").length, 3)
  assert.equal(contentParts("```md\n![image](test.png)\n```").filter(part => part.image).length, 0)
  await assert.rejects(attachment(directory))
  console.log("Attachment encoding, image clipboard and Markdown checks passed")
} finally { await rm(directory, { recursive: true, force: true }) }
