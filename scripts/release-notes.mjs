import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function versionNotes(changelog, tag) {
  const version = tag.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid release tag: ${tag}`)
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\][^\n]*\r?$/gm)]
  const matches = sections.filter(section => section[1] === version)
  if (matches.length !== 1) throw new Error(`CHANGELOG.md must contain exactly one section for [${version}]`)
  const section = matches[0]
  const next = sections[sections.indexOf(section) + 1]
  const body = changelog.slice(section.index + section[0].length, next?.index).trim()
  if (!body || !/^[-*] \S/m.test(body)) throw new Error(`CHANGELOG.md section [${version}] needs release entries`)
  return `## mini-dsh v${version}\n\n${body}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, output, automatic] = process.argv.slice(2)
  if (!tag) throw new Error('Usage: node scripts/release-notes.mjs <tag> [output] [github-notes-file]')
  let notes = versionNotes(readFileSync('CHANGELOG.md', 'utf8'), tag)
  if (automatic) {
    const generated = readFileSync(automatic, 'utf8').trim()
    if (generated) notes += `\n---\n\n## 提交与贡献者\n\n${generated}\n`
  }
  if (output) writeFileSync(output, notes)
  else process.stdout.write(notes)
}
