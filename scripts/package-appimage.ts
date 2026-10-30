import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { copyDistributionNotices } from "./distribution-notices"

const root = fileURLToPath(new URL("../", import.meta.url))
const toolsDirectory = resolve(root, "dist/tools")
const toolArchive = resolve(toolsDirectory, "appimagetool-x86_64.AppImage")
const toolUrl = "https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage"
const toolSha256 = "ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0"
const runtimeArchive = resolve(toolsDirectory, "appimage-runtime-x86_64")
const runtimeUrl = "https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64"
const runtimeSha256 = "2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d"

function digest(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function run(command: string, args: string[], options: { cwd: string; env?: Record<string, string> }) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): ${command}`)
}

async function download(path: string, url: string, sha256: string) {
  if (existsSync(path) && digest(path) === sha256) return
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Unable to download ${url}: HTTP ${response.status}`)
  const data = new Uint8Array(await response.arrayBuffer())
  if (createHash("sha256").update(data).digest("hex") !== sha256) {
    throw new Error(`Checksum mismatch: ${url}`)
  }
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, data, { mode: 0o755 })
  renameSync(temporary, path)
}

async function appImageTool() {
  const extracted = resolve(toolsDirectory, `appimagetool-${toolSha256}`)
  const executable = resolve(extracted, "AppRun")
  if (existsSync(executable)) return executable
  mkdirSync(toolsDirectory, { recursive: true })
  await download(toolArchive, toolUrl, toolSha256)
  const unpacked = resolve(toolsDirectory, "squashfs-root")
  rmSync(unpacked, { recursive: true, force: true })
  run(toolArchive, ["--appimage-extract"], { cwd: toolsDirectory })
  rmSync(extracted, { recursive: true, force: true })
  renameSync(unpacked, extracted)
  chmodSync(executable, 0o755)
  return executable
}

export async function packageAppImage() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("AppImage packaging currently supports a Linux x64 host")
  }
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string }
  const executable = resolve(root, "dist/package/mini-dsh-linux-x64/mini-dsh")
  if (!existsSync(executable) || !statSync(executable).isFile()) {
    throw new Error("Build the Linux package before creating an AppImage")
  }
  const appDir = resolve(root, "dist/appimage/mini-dsh.AppDir")
  rmSync(appDir, { recursive: true, force: true })
  mkdirSync(resolve(appDir, "usr/bin"), { recursive: true })
  mkdirSync(resolve(appDir, "usr/share/applications"), { recursive: true })
  mkdirSync(resolve(appDir, "usr/share/icons/hicolor/scalable/apps"), { recursive: true })
  copyFileSync(executable, resolve(appDir, "usr/bin/mini-dsh"))
  copyFileSync(resolve(executable, "../sharp-runtime.cjs"), resolve(appDir, "usr/bin/sharp-runtime.cjs"))
  cpSync(resolve(executable, "../node_modules"), resolve(appDir, "usr/bin/node_modules"), { recursive: true })
  for (const name of ["AppRun", "mini-dsh.desktop", "mini-dsh.svg"]) {
    copyFileSync(resolve(root, "packaging", name), resolve(appDir, name))
  }
  copyFileSync(resolve(appDir, "mini-dsh.desktop"), resolve(appDir, "usr/share/applications/mini-dsh.desktop"))
  copyFileSync(resolve(appDir, "mini-dsh.svg"), resolve(appDir, "usr/share/icons/hicolor/scalable/apps/mini-dsh.svg"))
  symlinkSync("mini-dsh.svg", resolve(appDir, ".DirIcon"))
  chmodSync(resolve(appDir, "AppRun"), 0o755)
  chmodSync(resolve(appDir, "usr/bin/mini-dsh"), 0o755)
  copyDistributionNotices(resolve(appDir, "usr/share/doc/mini-dsh"))
  const tool = await appImageTool()
  await download(runtimeArchive, runtimeUrl, runtimeSha256)
  const artifact = resolve(root, `dist/package/mini-dsh-${manifest.version}-linux-x86_64.AppImage`)
  rmSync(artifact, { force: true })
  run(tool, ["--comp", "zstd", "--no-appstream", "--runtime-file", runtimeArchive, appDir, artifact], {
    cwd: root,
    env: { ARCH: "x86_64", VERSION: manifest.version },
  })
  const bytes = statSync(artifact).size
  console.log(`[mini-dsh] AppImage: ${artifact} (${(bytes / 1e6).toFixed(1)} MB)`)
}
