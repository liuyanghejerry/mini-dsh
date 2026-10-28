import { spawn, type ChildProcess } from "node:child_process"
import { mkdirSync } from "node:fs"
import { basename, resolve } from "node:path"
import { resolveDshRuntimeAssets } from "./dsh-assets"
import { mapHistoryRecords, type DshHistoryPage, type DshHistoryReader, type DshSessionSummary, type DshWireEvent } from "./dsh-history"

export interface DshWebReaderOptions {
  workspace: string
  dshHome: string
  dshBin?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${name}`)
  return value
}

function sanitize(value: string): string {
  return value.replace(/https?:\/\/[^\s"']+/g, "[已隐藏地址]").replace(/token=[^\s&"']+/g, "token=[已隐藏]")
}

function waitForExit(child: ChildProcess, milliseconds: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      child.off("exit", onExit)
      resolve(false)
    }, milliseconds)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once("exit", onExit)
  })
}

function parseEnvelope(value: unknown): { rpcId: string; result: Record<string, unknown> } {
  if (!isRecord(value) || value.type !== "server-response" || typeof value.rpcId !== "string" || !isRecord(value.result)) {
    throw new Error("dsh Web 返回了无效的 RPC 响应")
  }
  return { rpcId: value.rpcId, result: value.result }
}

async function decodeResponse(response: Response): Promise<{ rpcId: string; result: Record<string, unknown> }> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (mediaType !== "multipart/form-data") return parseEnvelope(await response.json())
  const form = await response.formData()
  const metadata = form.get("metadata")
  if (typeof metadata !== "string") throw new Error("dsh Web 的附件响应缺少 metadata")
  const parsed = parseEnvelope(JSON.parse(metadata))
  const envelope = JSON.parse(metadata) as unknown
  if (!isRecord(envelope) || !Array.isArray(envelope.attachments)) throw new Error("dsh Web 的附件响应无效")
  if (parsed.result.ok !== true) return parsed
  const root: Record<string, unknown> = { value: parsed.result.value }
  for (const attachment of envelope.attachments) {
    if (!isRecord(attachment) || attachment.codec !== "bytes" || typeof attachment.part !== "string" || !Array.isArray(attachment.path)) {
      throw new Error("dsh Web 的附件描述无效")
    }
    const part = form.get(attachment.part)
    if (!(part instanceof Blob)) throw new Error("dsh Web 的附件内容缺失")
    let parent: Record<string, unknown> | unknown[] = root
    let key: string | number = "value"
    for (const segment of attachment.path) {
      if (segment === "__proto__" || segment === "prototype" || segment === "constructor") throw new Error("dsh Web 的附件路径无效")
      const current: unknown = parent
      if (typeof current !== "object" || current === null) throw new Error("dsh Web 的附件路径无效")
      if (Array.isArray(current) && (typeof segment !== "number" || !Number.isSafeInteger(segment) || segment < 0 || segment >= current.length)) {
        throw new Error("dsh Web 的附件路径无效")
      }
      if (!Object.hasOwn(current, segment)) throw new Error("dsh Web 的附件路径无效")
      parent = Reflect.get(current, segment) as Record<string, unknown> | unknown[]
      key = segment
    }
    if (Reflect.get(parent, key) !== null) throw new Error("dsh Web 的附件占位无效")
    Object.defineProperty(parent, key, { value: new Uint8Array(await part.arrayBuffer()), enumerable: true, writable: true, configurable: true })
  }
  parsed.result.value = root.value
  return parsed
}

export class DshWebReader implements DshHistoryReader {
  private child?: ChildProcess
  private startPromise?: Promise<void>
  private closePromise?: Promise<void>
  private origin?: string
  private cookie?: string
  private startupOutput = ""
  private stderr = ""
  private closing = false

  constructor(private readonly options: DshWebReaderOptions) {}

  start(): Promise<void> {
    if (this.closing) throw new Error("dsh Web 只读进程已关闭")
    this.startPromise ??= this.startProcess()
    return this.startPromise
  }

  private async startProcess() {
    mkdirSync(this.options.dshHome, { recursive: true })
    const executable = this.options.dshBin ?? resolveDshRuntimeAssets(this.options.dshHome).executable
    const child = spawn(executable, ["web", "--host", "127.0.0.1", "--port", "0", "--no-open"], {
      cwd: this.options.workspace,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "C.UTF-8",
        DSH_HOME: resolve(this.options.dshHome),
        DSH_PERMISSION_MODE: "read-only",
        DEEPSEEK_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.child = child
    let ready!: (url: URL) => void
    let fail!: (error: Error) => void
    const startup = new Promise<URL>((resolve, reject) => { ready = resolve; fail = reject })
    child.stdout.on("data", chunk => {
      if (this.origin) return
      this.startupOutput = `${this.startupOutput}${String(chunk)}`.slice(-16_000)
      for (const match of this.startupOutput.matchAll(/https?:\/\/[^\s"']+/g)) {
        try {
          const url = new URL(match[0])
          if (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.searchParams.get("token")) ready(url)
        } catch { /* Wait for the complete startup URL. */ }
      }
    })
    child.stderr.on("data", chunk => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-8000)
    })
    child.once("error", fail)
    child.once("exit", () => {
      if (!this.closing) {
        this.origin = undefined
        this.cookie = undefined
        this.startPromise = undefined
      }
      fail(new Error("dsh Web 只读进程提前退出"))
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const url = await Promise.race([
        startup,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("dsh Web 只读进程启动超时")), 20_000) }),
      ])
      const token = url.searchParams.get("token")!
      const connect = await fetch(`${url.origin}/connect?token=${encodeURIComponent(token)}&interactions=none`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      })
      const cookie = connect.headers.get("set-cookie")?.split(";", 1)[0]
      if (!cookie) throw new Error(`dsh Web 认证失败（${connect.status}）`)
      this.origin = url.origin
      this.cookie = cookie
    } catch (error) {
      await this.close()
      const message = error instanceof Error ? error.message : String(error)
      const diagnostic = this.stderr ? `：${this.stderr.slice(-800)}` : ""
      throw new Error(sanitize(`${message}${diagnostic}`))
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async rpc(method: string, args: Record<string, unknown>): Promise<unknown> {
    await this.start()
    if (!this.origin || !this.cookie) throw new Error("dsh Web 只读进程尚未连接")
    const rpcId = crypto.randomUUID()
    const response = await fetch(`${this.origin}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: this.cookie },
      body: JSON.stringify({ type: "client-request", rpcId, method, payload: { args } }),
      signal: AbortSignal.timeout(60_000),
    })
    const body = await decodeResponse(response)
    if (body.rpcId !== rpcId) throw new Error("dsh Web RPC 响应标识不匹配")
    if (body.result.ok === false) {
      const error = isRecord(body.result.error) ? body.result.error : {}
      const code = typeof error.code === "string" ? error.code : "gateway/internal"
      const message = typeof error.message === "string" ? error.message : "未知错误"
      throw new Error(`${code}: ${message}`)
    }
    if (!response.ok || body.result.ok !== true) throw new Error(`dsh Web RPC 失败（${response.status}）`)
    return body.result.value
  }

  async listSessions(): Promise<DshSessionSummary[]> {
    const value = await this.rpc("session/list", { _request: {} })
    if (!isRecord(value) || !Array.isArray(value.items)) throw new Error("dsh Web 会话列表格式无效")
    return value.items.flatMap(item => {
      if (!isRecord(item) || item.origin === "subagent") return []
      const cwd = requiredString(item.cwd, "session cwd")
      const projections = isRecord(item.projections) && isRecord(item.projections.values) ? item.projections.values : {}
      const title = typeof projections.title === "string" && projections.title.trim() ? projections.title : basename(cwd)
      return [{
        sessionId: requiredString(item.sessionId, "session id"),
        cwd,
        title,
        updatedAt: typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      }]
    })
  }

  private async readPage(sessionId: string, throughSeq: number, beforeSeq?: number) {
    return this.rpc("session/page", {
      request: {
        address: { kind: "session", sessionId },
        throughSeq,
        ...(beforeSeq !== undefined ? { beforeSeq } : {}),
        maxMessages: 50,
      },
    })
  }

  async readHistory(sessionId: string, throughSeq?: number, beforeSeq?: number): Promise<DshHistoryPage> {
    let cursor = throughSeq
    let title: string | undefined
    if (cursor === undefined) {
      const projection = await this.rpc("session/projections", { request: { sessionId } })
      if (!isRecord(projection) || typeof projection.asOfSeq !== "number" || !Number.isSafeInteger(projection.asOfSeq)) {
        throw new Error("dsh 会话需要迁移或没有可用的历史切点")
      }
      cursor = projection.asOfSeq
      if (isRecord(projection.values) && typeof projection.values.title === "string") title = projection.values.title
    }
    const value = await this.readPage(sessionId, cursor, beforeSeq)
    if (!isRecord(value) || !Array.isArray(value.records)) throw new Error("dsh Web 历史页格式无效")
    const records = value.records.flatMap(record => {
      if (!isRecord(record) || !isRecord(record.event)) return []
      const event = record.event
      if (typeof event.type !== "string" || typeof event.seq !== "number" || typeof event.time !== "number") return []
      return [{ type: event.type, seq: event.seq, time: event.time, data: event.data } satisfies DshWireEvent]
    })
    return {
      items: mapHistoryRecords(sessionId, records),
      hasMore: value.hasMore === true && records.length > 0,
      throughSeq: cursor,
      ...(records.length ? { beforeSeq: records[0]!.seq } : {}),
      ...(title ? { title } : {}),
    }
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeProcess()
    return this.closePromise
  }

  private async closeProcess() {
    this.closing = true
    this.origin = undefined
    this.cookie = undefined
    this.startupOutput = ""
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    child.kill("SIGTERM")
    if (!await waitForExit(child, 4000)) {
      child.kill("SIGKILL")
      if (!await waitForExit(child, 1500)) throw new Error("无法结束 dsh Web 只读进程")
    }
  }
}
