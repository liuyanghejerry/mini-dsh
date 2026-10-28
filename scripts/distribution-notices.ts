import { copyFileSync, cpSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))

export function copyDistributionNotices(destination: string) {
  mkdirSync(destination, { recursive: true })
  for (const name of ["LICENSE", "NOTICE"]) {
    copyFileSync(resolve(root, name), resolve(destination, name))
  }
  cpSync(resolve(root, "licenses"), resolve(destination, "licenses"), { recursive: true })
}
