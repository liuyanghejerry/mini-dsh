import assert from "node:assert/strict"
import { defineComponent, h } from "vue"
import { createTestApp, hasNativeTestRenderer } from "@gpuiv/vue/testing"
import { DiffCard } from "../src/components/DiffCard"
import { createDiffPatch } from "../src/services/tool-diffs"

const modified = createDiffPatch({
  path: "/workspace/example.ts",
  oldText: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n",
  newText: "one\ntwo\nTHREE\nfour\nfive\nsix\nseven\neight\nNINE\nten\n",
})
assert.equal(modified.additions, 2)
assert.equal(modified.deletions, 2)
assert.match(modified.patch, /-three[\s\S]*?\+THREE/)
assert.match(modified.patch, /-nine[\s\S]*?\+NINE/)
assert.ok(modified.patch.includes(" four"))
assert.equal((modified.patch.match(/@@/g) ?? []).length, 2)

const separated = createDiffPatch({
  path: "/workspace/separated.txt",
  oldText: Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n"),
  newText: Array.from({ length: 30 }, (_, index) => index === 2 ? "changed 3" : index === 26 ? "changed 27" : `line ${index + 1}`).join("\n"),
})
assert.equal((separated.patch.match(/@@/g) ?? []).length, 4)
assert.ok(separated.patch.includes("@@ -1,6 +1,6 @@"))
assert.ok(separated.patch.includes("@@ -24,7 +24,7 @@"))

const added = createDiffPatch({ path: "/workspace/new.txt", oldText: null, newText: "first\nsecond\n" })
assert.equal(added.additions, 2)
assert.equal(added.deletions, 0)
assert.match(added.patch, /@@ -0,0 \+1,2 @@/)
const removed = createDiffPatch({ path: "/workspace/old.txt", oldText: "first\n", newText: "" })
assert.equal(removed.deletions, 1)
assert.match(removed.patch, /@@ -1,1 \+0,0 @@/)
assert.equal(createDiffPatch({ path: "/same", oldText: "same\n", newText: "same\n" }).patch, "")
if (hasNativeTestRenderer) {
  const app = createTestApp(defineComponent({
    setup: () => () => h(DiffCard, { value: { path: "/workspace/example.ts", oldText: "before\n", newText: "after\n" } }),
  }))
  const painted = app.renderer.getPaintedText().join("\n")
  assert.ok(painted.includes("/workspace/example.ts"))
  assert.ok(painted.includes("before"))
  assert.ok(painted.includes("after"))
  app.unmount()
  console.log("Native DiffCard rendering checks passed")
}
console.log("Unified diff generation, hunks, stats and empty-file checks passed")
