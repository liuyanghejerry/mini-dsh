import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { activeFileMention, formatFileMention, insertFileMention, searchWorkspaceFiles } from "../src/services/file-mentions"

for (const text of ["me@example.com", "hello", "@file\n", '@"closed path"', "some@file"]) {
  assert.equal(activeFileMention(text, text.length), undefined, text)
}
assert.equal(activeFileMention("检查 @src/", 8)?.query, "src/")
assert.equal(activeFileMention('检查 @"my dir/文档', 14)?.query, "my dir/文档")
assert.equal(formatFileMention("src/main.ts"), "@src/main.ts")
assert.equal(formatFileMention("my dir/文档.md"), '@"my dir/文档.md"')
assert.equal(formatFileMention("trailing."), '@"trailing."')
assert.equal(formatFileMention('bad"name'), undefined)
assert.equal(formatFileMention("bad\nname"), undefined)
const draft = "请检查 @src/old.ts 并参考 @README.md"
const token = activeFileMention(draft, draft.indexOf("old"))!
assert.ok(token)
const inserted = insertFileMention(draft, token, "src/new file.ts")!
assert.equal(inserted.text, '请检查 @"src/new file.ts" 并参考 @README.md')
assert.equal(activeFileMention(inserted.text, inserted.cursor), undefined)
const quoted = '检查 @"old path.md" 之后'
assert.equal(insertFileMention(quoted, activeFileMention(quoted, 8)!, "new path.md")?.text, '检查 @"new path.md" 之后')

const root = await mkdtemp(join(tmpdir(), "mini-dsh-file-search-"))
const signal = new AbortController().signal
try {
  const workspace = join(root, "workspace")
  await mkdir(join(workspace, "src"), { recursive: true })
  await mkdir(join(workspace, ".git"))
  await mkdir(join(workspace, "node_modules"))
  await mkdir(join(workspace, "my dir"))
  await Promise.all([
    writeFile(join(workspace, "src/main.ts"), "source"),
    writeFile(join(workspace, "my dir/文档.md"), "text"),
    writeFile(join(workspace, ".gitignore"), "ignored.txt\n"),
    writeFile(join(workspace, "ignored.txt"), "ignored"),
    writeFile(join(workspace, "node_modules/dependency.js"), "ignored"),
    writeFile(join(workspace, ".git/config"), ""),
  ])
  const home = join(root, "home")
  assert.deepEqual((await searchWorkspaceFiles(workspace, home, "src/", signal)).paths, ["src/main.ts"])
  assert.deepEqual((await searchWorkspaceFiles(workspace, home, "文档", signal)).paths, ["my dir/文档.md"])
  const all = await searchWorkspaceFiles(workspace, home, "", signal)
  assert.ok(!all.paths.some(path => /ignored|dependency|\.git\//.test(path)))
  assert.equal(all.truncated, false)
  const other = join(root, "other")
  await mkdir(other)
  assert.deepEqual((await searchWorkspaceFiles(other, home, "src", signal)).paths, [])
  await assert.rejects(searchWorkspaceFiles(join(root, "missing"), home, "", signal))
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(searchWorkspaceFiles(workspace, home, "", abort.signal))
} finally { await rm(root, { recursive: true, force: true }) }
console.log("File mention grammar, insertion, workspace isolation and search checks passed")
