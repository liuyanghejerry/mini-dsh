import type { AvailableCommand } from "@agentclientprotocol/sdk"

export function parseSkillCommands(value: unknown): AvailableCommand[] {
  if (!value || typeof value !== "object" || !("skills" in value) || !Array.isArray(value.skills)) {
    throw new Error("dsh 技能目录格式无效")
  }
  return value.skills.map((skill: unknown) => {
    if (!skill || typeof skill !== "object" || !("name" in skill) || typeof skill.name !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)
      || !("description" in skill) || typeof skill.description !== "string") {
      throw new Error("dsh 技能目录条目无效")
    }
    return { name: skill.name, description: skill.description }
  })
}

export function mergeCommands(commands: AvailableCommand[], skills: AvailableCommand[]): AvailableCommand[] {
  return [...new Map([...skills, ...commands].map(command => [command.name, command])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Only complete the first token; arguments and file paths remain ordinary input.
export function slashQuery(draft: string): string | undefined {
  const match = /^\/([^\s/]*)$/.exec(draft)
  return match?.[0] === draft ? match[1] : undefined
}

export function filterCommands(commands: AvailableCommand[], query: string): AvailableCommand[] {
  const keyword = query.toLowerCase()
  return commands.filter(command => command.name.toLowerCase().includes(keyword)
    || command.description.toLowerCase().includes(keyword))
}
