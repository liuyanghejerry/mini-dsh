import { build, write } from "bun"
import { cpSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
const require = createRequire(import.meta.url)
export async function copyImageDependencies(destination: string) {
  for (const name of ["sharp", "@img/colour", "detect-libc", "semver", "@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64"]) {
    const source = dirname(require.resolve(`${name}/package.json`))
    const target = resolve(destination, "node_modules", name)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true, dereference: true })
  }

  const nativeVersion = require("@img/sharp-linux-x64/package").version as string
  const result = await build({
    entrypoints: [require.resolve("sharp")],
    target: "bun", format: "cjs",
    plugins: [{ name: "sharp-native-runtime", setup(build) {
      build.onResolve({ filter: /^@img\/sharp-linux-x64\/sharp.node$/ }, () => ({ path: "sharp-native", namespace: "sharp-runtime" }))
      build.onLoad({ filter: /.*/, namespace: "sharp-runtime" }, () => ({ loader: "js", contents:
        `module.exports = require(require("node:path").join(require("node:path").dirname(process.execPath), "node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-${nativeVersion}.node"));` }))
    } }],
  })
  if (!result.success) throw new Error(result.logs.join("\n"))
  await write(resolve(destination, "sharp-runtime.cjs"), result.outputs[0]!)
}
