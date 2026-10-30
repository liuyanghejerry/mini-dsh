export interface SessionMetrics {
  input?: number
  output?: number
  cacheRead?: number
  context?: number
  capacity?: number
  tokensPerSecond?: number
  turns?: number
  steps?: number
}
export function parseSessionMetrics(value: unknown): SessionMetrics {
  const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" ? v as Record<string, unknown> : {}
  const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined
  const root = obj(value), usage = obj(root.tokenUsage), context = obj(root.contextPressure), stats = obj(root.sessionStats)
  const uncached = number(usage.uncachedInputTokens), read = number(usage.cacheReadTokens), write = number(usage.cacheWriteTokens)
  const ms = number(stats.decodeMs), tokens = number(stats.decodeTokens)
  return { input: uncached !== undefined && read !== undefined && write !== undefined ? uncached + read + write : undefined,
    output: number(usage.outputTokens), cacheRead: read, context: number(context.pressureTokens), capacity: number(context.contextWindow),
    tokensPerSecond: ms && tokens !== undefined ? tokens * 1000 / ms : undefined, turns: number(stats.turns), steps: number(stats.steps) }
}
export function formatSessionMetrics(m: SessionMetrics): string {
  const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)
  return [m.turns !== undefined ? `${m.turns} 轮${m.steps !== undefined ? ` / ${m.steps} 步` : ""}` : "",
    m.tokensPerSecond !== undefined ? `${Math.round(m.tokensPerSecond)} tok/s` : "",
    m.input !== undefined ? `输入 ${compact(m.input)}` : "", m.output !== undefined ? `输出 ${compact(m.output)}` : "",
    m.input && m.cacheRead !== undefined ? `缓存命中 ${Math.round(m.cacheRead / m.input * 100)}%` : "",
    m.capacity && m.context !== undefined ? `上下文 ${Math.round(m.context / m.capacity * 100)}% (${compact(m.context)} / ${compact(m.capacity)})` : ""].filter(Boolean).join(" · ")
}
