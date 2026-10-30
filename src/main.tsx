import { createApp } from "@gpuiv/vue"
import { App } from "./App"
import { closeAllRuntimes } from "./services/dsh-runtime"

async function closeApplication() {
  await closeAllRuntimes()
  app.unmount()
  app.renderer.closeWindow?.()
}

const app = createApp(App, {
  title: "mini dsh",
  width: 1200,
  height: 820,
  titlebarTransparent: true,
  focus: process.env.GPUIX_BACKGROUND !== "1",
  onRuntimeError: (error, info) => { console.error(`[mini-dsh] ${info}`, error) },
  onWindowShouldClose: () => { void closeApplication() },
})
