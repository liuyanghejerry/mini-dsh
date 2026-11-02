import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type Sharp from "sharp"

// Bun cannot embed libvips' shared libraries. Compiled releases ship sharp
// alongside the executable; source runs resolve the normal installed package.
const location = import.meta.url.startsWith("file:///$bunfs/")
  ? join(dirname(process.execPath), "image-codec.cjs") : import.meta.url
const require = createRequire(location)
const packageName = ["sh", "arp"].join("")
export function loadSharp(): typeof Sharp {
  return require(import.meta.url.startsWith("file:///$bunfs/")
    ? join(dirname(process.execPath), "sharp-runtime.cjs")
    : packageName)
}
