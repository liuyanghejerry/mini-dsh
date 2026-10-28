import { homedir } from "node:os"
import { resolve } from "node:path"

export function officialDshHome(): string {
  return resolve(homedir(), ".dsh")
}
