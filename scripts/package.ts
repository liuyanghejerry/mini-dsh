import { copyImageDependencies } from "./package-image-dependencies"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { packageAppImage } from "./package-appimage"
import { copyDistributionNotices } from "./distribution-notices"

const root = fileURLToPath(new URL("../", import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { gpuiv?: { root?: string } }
const gpuivRoot = resolve(root, process.env.GPUIV_ROOT ?? manifest.gpuiv?.root ?? "../gpuiv")

function run(entry: string, args: string[]) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): ${entry}`)
}

run(resolve(root, "scripts/install-dsh.ts"), [])
run(resolve(gpuivRoot, "packages/packager/bin/gpuiv-packager.ts"), [
  "build",
  "--config", resolve(root, "gpuiv.package.json"),
  "--no-smoke",
])
const productName = "mini-dsh-linux-x64"
const productDirectory = resolve(root, "dist/package", productName)
copyDistributionNotices(productDirectory)
await copyImageDependencies(productDirectory)
const archive = spawnSync("tar", ["-czf", `${productDirectory}.tar.gz`, "-C", resolve(root, "dist/package"), productName], {
  cwd: root,
  stdio: "inherit",
})
if (archive.error) throw archive.error
if (archive.status !== 0) throw new Error(`Command failed (${archive.status}): tar`)
if (process.argv.includes("--appimage")) await packageAppImage()
