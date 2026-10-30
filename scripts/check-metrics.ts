import assert from "node:assert/strict"
import { parseSessionMetrics, formatSessionMetrics } from "../src/services/session-metrics"
const metrics = parseSessionMetrics({ tokenUsage: { uncachedInputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 0, outputTokens: 100 }, contextPressure: { pressureTokens: 390, contextWindow: 1000 }, sessionStats: { decodeTokens: 100, decodeMs: 500, turns: 7, steps: 20 } })
assert.equal(metrics.input, 1000)
assert.equal(metrics.tokensPerSecond, 200)
assert.ok(formatSessionMetrics(metrics).includes("上下文 39%"))
assert.ok(formatSessionMetrics(metrics).includes("缓存命中 90%"))
assert.equal(formatSessionMetrics(parseSessionMetrics(null)), "")
assert.equal(parseSessionMetrics({ sessionStats: { decodeMs: 0, decodeTokens: 1 } }).tokensPerSecond, undefined)
assert.equal(parseSessionMetrics({ tokenUsage: { outputTokens: -1 } }).output, undefined)
console.log("Session metrics regression checks passed")
