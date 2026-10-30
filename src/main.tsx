import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sharp } from "./services/image-codec"
import { resolveDshRuntimeAssets } from "./services/dsh-assets"
import { createApp } from "@gpuiv/vue"
import { App } from "./App"
import { closeAllRuntimes } from "./services/dsh-runtime"

// Release smoke test: no window, credentials, network requests or user state.
if (process.argv.includes("--self-test")) {
  const home = mkdtempSync(join(tmpdir(), "mini-dsh-smoke-"))
  try {
    const image = await sharp({ create: { width: 1, height: 1, channels: 4, background: "#fff" } }).png().toBuffer()
    if (!image.length) throw new Error("Image codec smoke test failed")
    const assets = resolveDshRuntimeAssets(home)
    execFileSync(assets.executable, ["--version"], { env: { PATH: process.env.PATH, HOME: home, DSH_HOME: home }, timeout: 20000 })
    execFileSync(assets.sidecar, ["--version"], { timeout: 20000 })
    console.log("mini-dsh self-test passed (image codec, dsh runtime, ripgrep)")
  } finally { rmSync(home, { recursive: true, force: true }) }
  process.exit(0)
}

async function closeApplication() {
  await closeAllRuntimes()
  app.unmount()
  app.renderer.closeWindow?.()
}

const app = createApp(App, {
  title: "mini-dsh",
  appName: "mini-dsh",
  appId: "mini-dsh",
  width: 1200,
  height: 820,
  titlebarTransparent: true,
  windowBackground: "transparent",
  focus: process.env.GPUIX_BACKGROUND !== "1",
  onRuntimeError: (error, info) => { console.error(`[mini-dsh] ${info}`, error) },
  onWindowShouldClose: () => { void closeApplication() },
})
