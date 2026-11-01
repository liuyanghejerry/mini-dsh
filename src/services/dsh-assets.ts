import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isPackaged } from "@gpuiv/vue"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))

interface RuntimeManifest {
  version: string
  executable: string
  sidecar: string
}

export interface DshRuntimeAssets {
  executable: string
  sidecar: string
}

export function resolveDshRuntimeAssets(): DshRuntimeAssets {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("当前构建仅包含 Linux x64 的 dsh 运行时")
  }
  if (isPackaged()) {
    const executable = resolve(dirname(process.execPath), "dsh-runtime/deepseek-harness-sdk-runtime-linux-x64")
    return { executable, sidecar: `${executable}-rg` }
  }
  const manifest = JSON.parse(readFileSync(resolve(projectRoot, "vendor/dsh-runtime/runtime.json"), "utf8")) as RuntimeManifest
  return {
    executable: resolve(projectRoot, manifest.executable),
    sidecar: resolve(projectRoot, manifest.sidecar),
  }
}
