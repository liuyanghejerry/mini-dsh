import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { newerVersion, parseRelease, verifyDownload, installUpdate } from "../src/services/app-updates"
assert.ok(newerVersion("0.2.0", "0.1.9"))
assert.ok(!newerVersion("0.1.0", "0.1.0"))
assert.ok(!newerVersion("0.1.0-beta", "0.1.0"))
const filename = "mini-dsh-0.2.0-linux-x86_64.AppImage"
const prefix = "https://github.com/liuyanghejerry/mini-dsh/releases/download/v0.2.0/"
const release = { tag_name: "v0.2.0", assets: [{ name: filename, size: 3, browser_download_url: prefix + filename }, { name: "SHA256SUMS", browser_download_url: prefix + "SHA256SUMS" }] }
assert.equal(parseRelease(release, "0.1.0")?.version, "0.2.0")
assert.equal(parseRelease({ ...release, prerelease: true }), undefined)
assert.throws(() => parseRelease({ ...release, assets: [] }))
const bytes = Buffer.from("abc"), hash = createHash("sha256").update(bytes).digest("hex")
verifyDownload(bytes, `${hash}  ${filename}\n`, filename, 3)
assert.throws(() => verifyDownload(Buffer.from("xyz"), `${hash}  ${filename}`, filename, 3))
assert.throws(() => verifyDownload(bytes, `${hash}  wrong`, filename, 3))
assert.throws(() => verifyDownload(bytes, `${hash}  ${filename}`, filename, 4))
const directory = await mkdtemp(join(tmpdir(), "mini-dsh-update-test-"))
try {
  const original = join(directory, "mini-dsh.AppImage"), next = join(directory, "download")
  await writeFile(original, "old"); await writeFile(next, "new")
  await installUpdate(next, original)
  assert.equal(await readFile(original, "utf8"), "new")
  assert.ok((await stat(original)).mode & 0o100)
  await assert.rejects(installUpdate(join(directory, "missing"), original))
  assert.equal(await readFile(original, "utf8"), "new")
} finally { await rm(directory, { recursive: true, force: true }) }
console.log("Update version, integrity and atomic-install checks passed")
