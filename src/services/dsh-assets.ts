import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isPackaged } from "@gpuiv/vue"
import runtimeAsset from "../../vendor/dsh-runtime/assets/dsh-linux-x64.bin" with { type: "file" }
import sidecarAsset from "../../vendor/dsh-runtime/assets/dsh-linux-x64-rg.bin" with { type: "file" }

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

function materialize(source: string, destination: string) {
  const data = readFileSync(source)
  if (existsSync(destination) && statSync(destination).size === data.length) {
    chmodSync(destination, 0o755)
    return
  }
  const temporary = `${destination}.${process.pid}.tmp`
  writeFileSync(temporary, data, { mode: 0o755 })
  renameSync(temporary, destination)
  chmodSync(destination, 0o755)
}

export function resolveDshRuntimeAssets(dshHome: string): DshRuntimeAssets {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("当前构建仅包含 Linux x64 的 dsh 运行时")
  }
  if (!isPackaged()) {
    const manifest = JSON.parse(readFileSync(resolve(projectRoot, "vendor/dsh-runtime/runtime.json"), "utf8")) as RuntimeManifest
    return {
      executable: resolve(projectRoot, manifest.executable),
      sidecar: resolve(projectRoot, manifest.sidecar),
    }
  }
  const directory = resolve(dshHome, "runtime", "0.2.1-rc.2")
  mkdirSync(directory, { recursive: true })
  const executable = resolve(directory, "deepseek-harness-sdk-runtime-linux-x64")
  const sidecar = `${executable}-rg`
  materialize(runtimeAsset, executable)
  materialize(sidecarAsset, sidecar)
  return { executable, sidecar }
}
