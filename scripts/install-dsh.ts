import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { resolve, relative } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const version = "0.2.1rc2"
const root = fileURLToPath(new URL("../", import.meta.url))
const target = resolve(root, "vendor/dsh-runtime")
const runtimeDirectory = resolve(target, "deepseek_harness_runtime/runtime")

function artifacts() {
  if (!existsSync(runtimeDirectory)) return null
  const executable = readdirSync(runtimeDirectory).find(name =>
    name.startsWith("deepseek-harness-sdk-runtime-") && !name.endsWith("-rg") && statSync(resolve(runtimeDirectory, name)).isFile(),
  )
  if (!executable) return null
  const sidecar = `${executable}-rg`
  if (!existsSync(resolve(runtimeDirectory, sidecar))) {
    throw new Error(`Missing dsh runtime sidecar: ${sidecar}`)
  }
  return { executable: resolve(runtimeDirectory, executable), sidecar: resolve(runtimeDirectory, sidecar) }
}

const metadataPath = resolve(target, `deepseek_harness_runtime_bin-${version}.dist-info/METADATA`)
if (!artifacts() || !existsSync(metadataPath)) {
  const install = spawnSync("uv", ["pip", "install", "--upgrade", "--target", target, `deepseek-harness-runtime-bin==${version}`], {
    cwd: root,
    stdio: "inherit",
  })
  if (install.error) throw install.error
  if (install.status !== 0) throw new Error("Unable to install the pinned dsh runtime")
}

const current = artifacts()
if (!current) throw new Error("The installed dsh runtime has no native executable")
const metadata = readFileSync(metadataPath, "utf8")
if (!metadata.includes(`Version: ${version}`)) throw new Error("The installed dsh runtime version does not match the pin")
const check = spawnSync(current.executable, ["--version"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", DSH_HOME: resolve(root, ".mini-dsh/dsh-home") },
  encoding: "utf8",
  timeout: 20_000,
})
if (check.error) throw check.error
if (check.status !== 0) throw new Error(`dsh --version failed: ${check.stderr.slice(-1200)}`)
const assets = resolve(target, "assets")
mkdirSync(assets, { recursive: true })
for (const [source, name] of [[current.executable, "dsh-linux-x64.bin"], [current.sidecar, "dsh-linux-x64-rg.bin"]] as const) {
  const destination = resolve(assets, name)
  rmSync(destination, { force: true })
  linkSync(source, destination)
}
writeFileSync(resolve(target, "runtime.json"), `${JSON.stringify({
  version,
  executable: relative(root, current.executable),
  sidecar: relative(root, current.sidecar),
}, null, 2)}\n`)
console.log(`[mini-dsh] dsh runtime ${version}: ${check.stdout.trim() || check.stderr.trim()}`)
