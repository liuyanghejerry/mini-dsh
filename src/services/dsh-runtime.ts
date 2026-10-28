import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { Readable, Writable } from "node:stream"
import {
  client,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ClientConnection,
  type NewSessionResponse,
  type PromptResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ResumeSessionResponse,
  type SessionInfo,
  type SessionNotification,
  type SetSessionConfigOptionResponse,
} from "@agentclientprotocol/sdk"
import { resolveDshRuntimeAssets } from "./dsh-assets"

export interface DshRuntimeOptions {
  workspace: string
  dshHome: string
  apiKey?: string
  baseUrl?: string
  dshBin?: string
  onUpdate: (notification: SessionNotification) => void
  onPermission: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>
  onExit?: (error: Error) => void
}

const activeRuntimes = new Set<DshRuntime>()

export async function closeAllRuntimes() {
  await Promise.all([...activeRuntimes].map(runtime => runtime.close()))
}

function waitForExit(child: ChildProcessWithoutNullStreams, milliseconds: number): Promise<boolean> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
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

export class DshRuntime {
  private child?: ChildProcessWithoutNullStreams
  private connection?: ClientConnection
  private startPromise?: Promise<void>
  private closePromise?: Promise<void>
  private stderr = ""
  private closing = false

  constructor(private readonly options: DshRuntimeOptions) {
    activeRuntimes.add(this)
  }

  async start(): Promise<void> {
    if (this.closing) throw new Error("DSH 运行时已关闭")
    this.startPromise ??= this.startProcess()
    return this.startPromise
  }

  private async startProcess() {
    mkdirSync(this.options.dshHome, { recursive: true })
    const executable = this.options.dshBin ?? resolveDshRuntimeAssets(this.options.dshHome).executable
    const child = spawn(executable, ["--profile", "acp"], {
      cwd: this.options.workspace,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "C.UTF-8",
        DSH_HOME: resolve(this.options.dshHome),
        DSH_PERMISSION_MODE: process.env.DSH_PERMISSION_MODE ?? "workspace-write",
        DEEPSEEK_API_KEY: this.options.apiKey ?? "",
        ...(this.options.baseUrl ? { DEEPSEEK_BASE_URL: this.options.baseUrl } : {}),
        ...(process.env.HTTP_PROXY ? { HTTP_PROXY: process.env.HTTP_PROXY } : {}),
        ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY } : {}),
        ...(process.env.NO_PROXY ? { NO_PROXY: process.env.NO_PROXY } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.child = child
    child.stderr.on("data", chunk => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-8000)
    })
    child.once("exit", (code, signal) => {
      if (!this.closing) this.options.onExit?.(new Error(`DSH 运行时意外退出（${code ?? signal ?? "unknown"}）`))
    })
    const connection = client({ name: "mini-dsh" })
      .onRequest(methods.client.session.requestPermission, context => this.options.onPermission(context.params))
      .onNotification(methods.client.session.update, context => { this.options.onUpdate(context.params) })
      .connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)))
    this.connection = connection
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        connection.agent.request(methods.agent.initialize, {
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "mini-dsh", version: "0.1.0" },
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("DSH 初始化超时")), 15_000)
        }),
        new Promise<never>((_, reject) => { child.once("error", reject) }),
      ]).finally(() => { if (timer) clearTimeout(timer) })
    } catch (error) {
      await this.close()
      throw this.error(error)
    }
  }

  private error(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error)
    const diagnostic = this.stderr ? `：${this.stderr.slice(-1200)}` : ""
    const secrets = [this.options.apiKey, this.options.baseUrl].filter((value): value is string => Boolean(value))
    return new Error(secrets.reduce((text, secret) => text.split(secret).join("[已隐藏]"), `${message}${diagnostic}`))
  }

  private async agent(): Promise<ClientConnection["agent"]> {
    await this.start()
    if (!this.connection) throw new Error("DSH 尚未连接")
    return this.connection.agent
  }

  async newSession(cwd = this.options.workspace): Promise<NewSessionResponse> {
    const agent = await this.agent()
    return agent.request(methods.agent.session.new, { cwd, mcpServers: [] })
  }

  async resumeSession(sessionId: string, cwd = this.options.workspace): Promise<ResumeSessionResponse> {
    const agent = await this.agent()
    return agent.request(methods.agent.session.resume, { sessionId, cwd, mcpServers: [] })
  }

  async listSessions(): Promise<SessionInfo[]> {
    const agent = await this.agent()
    const sessions: SessionInfo[] = []
    let cursor: string | undefined
    for (let page = 0; page < 20; page++) {
      const result = await agent.request(methods.agent.session.list, { cwd: this.options.workspace, ...(cursor ? { cursor } : {}) })
      sessions.push(...result.sessions)
      if (!result.nextCursor) break
      cursor = result.nextCursor
    }
    return sessions
  }

  prompt(sessionId: string, text: string): Promise<PromptResponse> {
    return this.agent().then(agent => agent.request(methods.agent.session.prompt, {
      sessionId,
      prompt: [{ type: "text", text }],
    }))
  }

  async cancel(sessionId: string): Promise<void> {
    const agent = await this.agent()
    await agent.notify(methods.agent.session.cancel, { sessionId })
  }

  async closeSession(sessionId: string): Promise<void> {
    const agent = await this.agent()
    await agent.request(methods.agent.session.close, { sessionId })
  }

  async setConfig(sessionId: string, configId: string, value: string | boolean): Promise<SetSessionConfigOptionResponse> {
    const agent = await this.agent()
    return agent.request(methods.agent.session.setConfigOption, {
      sessionId,
      configId,
      ...(typeof value === "boolean" ? { type: "boolean" as const, value } : { value }),
    })
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeProcess()
    return this.closePromise
  }

  private async closeProcess() {
    this.closing = true
    activeRuntimes.delete(this)
    try { this.connection?.close() } catch { /* The process teardown below is authoritative. */ }
    const child = this.child
    if (child) {
      if (!child.stdin.destroyed) child.stdin.end()
      if (!await waitForExit(child, 2500)) {
        child.kill("SIGTERM")
        if (!await waitForExit(child, 2000)) {
          child.kill("SIGKILL")
          if (!await waitForExit(child, 1500)) throw new Error("无法结束 DSH 运行时")
        }
      }
    }
  }
}
