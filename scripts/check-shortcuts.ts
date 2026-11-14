import assert from "node:assert/strict"
import { shortcutAction } from "../src/services/keyboard-shortcuts"

const options = { blocked: false, streaming: true }
for (const [key, expected] of [["n", "new"], ["k", "global-search"], ["f", "conversation-search"], ["e", "export"], [",", "settings"], ["tab", "next"]] as const) {
  assert.equal(shortcutAction({ key, modifiers: { ctrl: true } }, options), expected)
}
assert.equal(shortcutAction({ key: "tab", modifiers: { cmd: true, shift: true } }, options), "previous")
assert.equal(shortcutAction({ key: "Escape" }, options), "stop")
assert.equal(shortcutAction({ key: "Escape" }, { blocked: false, streaming: false }), null)
assert.equal(shortcutAction({ key: "n", modifiers: { ctrl: true } }, { blocked: true, streaming: true }), null)
assert.equal(shortcutAction({ key: ",", modifiers: { ctrl: true } }, { blocked: true, streaming: true }), "settings")
assert.equal(shortcutAction({ key: "n", modifiers: { ctrl: true }, defaultPrevented: true }, options), null)
assert.equal(shortcutAction({ key: "n" }, options), null)
console.log("Shortcut mappings, modifiers, dialog blocking and escape checks passed")
