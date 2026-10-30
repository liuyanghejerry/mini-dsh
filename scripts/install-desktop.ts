import { mkdirSync, copyFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

if (process.platform !== "linux") throw new Error("Desktop entry installation is supported on Linux")
const root = fileURLToPath(new URL("../", import.meta.url))
const data = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
const applications = join(data, "applications")
const icons = join(data, "icons", "hicolor", "scalable", "apps")
mkdirSync(applications, { recursive: true })
mkdirSync(icons, { recursive: true })
copyFileSync(resolve(root, "packaging/mini-dsh.svg"), join(icons, "mini-dsh.svg"))
const quote = (value: string) => `"${value.replace(/[%]/g, "%%").replace(/[\\"`$]/g, "\\$&")}"`
writeFileSync(join(applications, "mini-dsh.desktop"), `[Desktop Entry]\nType=Application\nName=mini-dsh\nComment=DeepSeek desktop chat\nExec=${quote(process.execPath)} run ${quote(resolve(root, "src/main.tsx"))}\nPath=${root}\nIcon=mini-dsh\nStartupWMClass=mini-dsh\nTerminal=false\nCategories=Network;Chat;\n`)
spawnSync("update-desktop-database", [applications])
console.log("Installed mini-dsh desktop entry and bear icon")
