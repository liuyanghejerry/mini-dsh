import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  gpuiv?: { root?: string }
}
const gpuivRoot = resolve(root, process.env.GPUIV_ROOT ?? manifest.gpuiv?.root ?? "../gpuiv")

function link(source: string, destination: string, expectedName: string) {
  const sourceManifest = resolve(source, "package.json")
  if (!existsSync(sourceManifest)) {
    throw new Error(`Cannot find ${sourceManifest}. Set GPUIV_ROOT to your GPUIV checkout.`)
  }
  const { name } = JSON.parse(readFileSync(sourceManifest, "utf8")) as { name?: string }
  if (name !== expectedName) throw new Error(`${source} is ${name ?? "unnamed"}, expected ${expectedName}`)

  mkdirSync(dirname(destination), { recursive: true })
  if (existsSync(destination) || lstatSync(destination, { throwIfNoEntry: false })?.isSymbolicLink()) {
    if (lstatSync(destination).isSymbolicLink() && realpathSync(destination) === realpathSync(source)) return
    rmSync(destination, { recursive: true, force: true })
  }
  symlinkSync(source, destination, "dir")
  console.log(`[mini-dsh] ${expectedName} → ${source}`)
}

for (const name of ["vue", "native"]) {
  link(resolve(gpuivRoot, "packages", name), resolve(root, "node_modules", "@gpuiv", name), `@gpuiv/${name}`)
}
link(resolve(gpuivRoot, "packages", "vue", "node_modules", "vue"), resolve(root, "node_modules", "vue"), "vue")
