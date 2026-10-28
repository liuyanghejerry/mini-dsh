import { computed, ref } from "vue"
import { statSync } from "node:fs"
import { resolve } from "node:path"
import type { RequestPermissionRequest, RequestPermissionResponse, SessionConfigOption, SessionInfo, SessionNotification } from "@agentclientprotocol/sdk"
import { DshRuntime } from "../services/dsh-runtime"
import { applyAcpUpdate, lastAssistant } from "../services/dsh-events"
import { officialDshHome } from "../services/dsh-home"
import { createChatStorage, type ChatStorage } from "./storage"
import type { ChatMessage, ConfigChoice, Conversation, PersistedChat } from "../types"

export interface ChatStoreOptions {
  storage?: ChatStorage
  runtime?: DshRuntime
  environmentApiKey?: string
  baseUrl?: string
  workspace?: string
  dshHome?: string
  dshBin?: string
}

export interface PendingPermission {
  request: RequestPermissionRequest
  resolve: (response: RequestPermissionResponse) => void
}

function createConversation(workspace: string, dshHome: string): Conversation {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: "新的对话",
    items: [],
    createdAt: now,
    updatedAt: now,
    cwd: workspace,
    dshHome,
    configOptions: [],
    historyCached: true,
    running: false,
    active: false,
    permissionPending: false,
  }
}

function titleFor(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  const characters = Array.from(normalized)
  return characters.length > 34 ? `${characters.slice(0, 34).join("")}…` : normalized
}

function currentOption(conversation: Conversation, id: string): SessionConfigOption | undefined {
  return conversation.configOptions.find(option => option.id === id && option.type === "select")
}

function currentValue(conversation: Conversation, id: string): string | undefined {
  const option = currentOption(conversation, id)
  if (option?.type === "select") return option.currentValue
  return undefined
}

function choices(conversation: Conversation, id: string): ConfigChoice[] {
  const option = currentOption(conversation, id)
  if (option?.type !== "select") return []
  return option.options.flatMap(entry => "value" in entry
    ? [{ key: entry.value, label: entry.name, ...(entry.description ? { description: entry.description } : {}) }]
    : entry.options.map(value => ({ key: value.value, label: value.name, ...(value.description ? { description: value.description } : {}) })))
}

function errorMessage(error: unknown, secrets: string[]): string {
  const message = error instanceof Error ? error.message : String(error)
  return secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join("[已隐藏]"), message)
}

export function createChatStore(options: ChatStoreOptions = {}) {
  const storage = options.storage ?? createChatStorage()
  const restored = storage.load()
  const initial = restored.data
  const requestedHome = options.dshHome ?? process.env.DSH_HOME?.trim() ?? initial?.dshHome
  const runtimeHome = requestedHome ? resolve(requestedHome) : officialDshHome()
  const cachedConversations = initial?.conversations.filter(item => item.dshHome === runtimeHome) ?? []
  const conversations = ref<Conversation[]>([...(initial?.conversations ?? [])])
  if (!cachedConversations.length) conversations.value.push(createConversation(options.workspace ?? process.cwd(), runtimeHome))
  const initialActive = cachedConversations.find(item => item.id === initial?.activeId) ?? cachedConversations[0]
  const activeId = ref(initialActive?.id ?? conversations.value.find(item => item.dshHome === runtimeHome)!.id)
  const active = computed(() => conversations.value.find(item => item.id === activeId.value && item.dshHome === runtimeHome)
    ?? conversations.value.find(item => item.dshHome === runtimeHome)!)
  const query = ref("")
  const model = ref(initial?.model ?? '["deepseek-official","deepseek-v4-flash"]')
  const reasoning = ref(initial?.reasoning ?? "high")
  const workspace = ref(options.workspace ?? initial?.workspace ?? process.cwd())
  const dshHome = ref(runtimeHome)
  const connectionMode = ref<"starting" | "ready" | "error">("starting")
  const notice = ref<string | null>(restored.error)
  const pendingPermission = ref<PendingPermission | null>(null)
  const pendingPermissions = new Map<string, PendingPermission>()
  const environmentApiKey = options.environmentApiKey ?? process.env.DEEPSEEK_API_KEY?.trim() ?? ""
  let runtimeApiKey = environmentApiKey
  let runtimeFailed = false
  let disposed = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let disposePromise: Promise<void> | undefined
  let runtime: DshRuntime

  const isStreaming = computed(() => active.value.running)
  const modelValue = computed(() => currentValue(active.value, "model") ?? model.value)
  const reasoningValue = computed(() => currentValue(active.value, "reasoning_effort") ?? reasoning.value)
  const modelOptions = computed(() => choices(active.value, "model").length
    ? choices(active.value, "model")
    : [{ key: model.value, label: "deepseek-v4-flash" }])
  const reasoningOptions = computed(() => choices(active.value, "reasoning_effort"))
  const modelLabel = computed(() => modelOptions.value.find(option => option.key === modelValue.value)?.label ?? "DeepSeek")
  const thinking = computed({
    get: () => reasoningValue.value !== "off",
    set: (value: boolean) => { void setReasoning(value ? "high" : "off") },
  })
  const filteredConversations = computed(() => {
    const keyword = query.value.trim().toLocaleLowerCase()
    return conversations.value
      .filter(item => item.dshHome === runtimeHome && (!keyword || item.title.toLocaleLowerCase().includes(keyword)
        || item.items.some(entry => entry.kind === "message" && entry.content.toLocaleLowerCase().includes(keyword))))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  })

  function snapshot(): PersistedChat {
    return {
      version: 2,
      activeId: activeId.value,
      model: model.value,
      reasoning: reasoning.value,
      workspace: workspace.value,
      dshHome: dshHome.value,
      conversations: conversations.value.map(conversation => ({
        id: conversation.id,
        sessionId: conversation.sessionId,
        title: conversation.title,
        items: conversation.items,
        draft: conversation.draft,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        cwd: conversation.cwd,
        dshHome: conversation.dshHome,
        historyCached: conversation.historyCached,
      })),
    }
  }

  function persistNow() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = undefined
    if (restored.error) return
    try {
      storage.save(snapshot())
    } catch {
      notice.value = "界面缓存保存失败，请检查 .mini-dsh 目录。dsh 会话记录不受影响。"
    }
  }

  function scheduleSave() {
    if (restored.error || saveTimer || disposed) return
    saveTimer = setTimeout(persistNow, 250)
  }

  function fail(error: unknown) {
    notice.value = errorMessage(error, [runtimeApiKey, options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? ""])
  }

  function onUpdate(notification: SessionNotification) {
    if (disposed) return
    const conversation = conversations.value.find(item => item.sessionId === notification.sessionId)
    if (!conversation) return
    applyAcpUpdate(conversation, notification.update, modelLabel.value)
    if (notification.update.sessionUpdate === "config_option_update") {
      model.value = currentValue(conversation, "model") ?? model.value
      reasoning.value = currentValue(conversation, "reasoning_effort") ?? reasoning.value
    }
    conversation.updatedAt = Date.now()
    scheduleSave()
  }

  function syncPermission() {
    pendingPermission.value = pendingPermissions.values().next().value ?? null
  }

  function cancelPermission(sessionId: string) {
    const pending = pendingPermissions.get(sessionId)
    if (!pending) return
    pendingPermissions.delete(sessionId)
    pending.resolve({ outcome: { outcome: "cancelled" } })
    syncPermission()
  }

  async function onPermission(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const conversation = conversations.value.find(item => item.sessionId === request.sessionId)
    if (!conversation || disposed) return { outcome: { outcome: "cancelled" } }
    conversation.permissionPending = true
    try {
      return await new Promise<RequestPermissionResponse>(resolve => {
        pendingPermissions.set(request.sessionId, { request, resolve })
        syncPermission()
      })
    } finally {
      conversation.permissionPending = false
    }
  }

  function respondPermission(optionId?: string) {
    const pending = pendingPermission.value
    if (!pending) return
    pendingPermissions.delete(pending.request.sessionId)
    pending.resolve(optionId ? { outcome: { outcome: "selected", optionId } } : { outcome: { outcome: "cancelled" } })
    syncPermission()
  }

  function onExit(error: Error) {
    if (disposed) return
    runtimeFailed = true
    connectionMode.value = "error"
    for (const conversation of conversations.value) {
      conversation.active = false
      conversation.running = false
      const assistant = lastAssistant(conversation)
      if (assistant?.status === "streaming") {
        assistant.status = "error"
        assistant.error = error.message
      }
      if (conversation.sessionId) cancelPermission(conversation.sessionId)
    }
    fail(error)
    persistNow()
  }

  function createRuntime(): DshRuntime {
    return new DshRuntime({
      workspace: workspace.value,
      dshHome: runtimeHome,
      apiKey: runtimeApiKey,
      baseUrl: options.baseUrl,
      dshBin: options.dshBin,
      onUpdate,
      onPermission,
      onExit,
    })
  }

  runtime = options.runtime ?? createRuntime()

  function fromSession(info: SessionInfo): Conversation {
    const updatedAt = info.updatedAt ? Date.parse(info.updatedAt) : Date.now()
    return {
      id: info.sessionId,
      sessionId: info.sessionId,
      title: info.title?.trim() || "dsh 会话",
      items: [],
      createdAt: updatedAt,
      updatedAt,
      cwd: info.cwd,
      dshHome: runtimeHome,
      configOptions: [],
      historyCached: false,
      running: false,
      active: false,
      permissionPending: false,
    }
  }

  async function initialize() {
    try {
      await runtime.start()
      const sessions = await runtime.listSessions()
      const current = conversations.value.filter(item => item.dshHome === runtimeHome)
      const draft = current.length === 1 ? current[0] : undefined
      if (!cachedConversations.length && sessions.length && draft
        && !draft.sessionId && !draft.items.length && !draft.draft) {
        const imported = sessions.map(fromSession)
        conversations.value = [...conversations.value.filter(item => item.dshHome !== runtimeHome), ...imported]
        activeId.value = imported[0]!.id
      } else {
        for (const info of sessions) {
          const existing = conversations.value.find(item => item.sessionId === info.sessionId && item.dshHome === runtimeHome)
          if (existing) {
            if (info.title) existing.title = info.title
            existing.cwd = info.cwd
            if (info.updatedAt) existing.updatedAt = Date.parse(info.updatedAt)
          } else {
            conversations.value.push(fromSession(info))
          }
        }
      }
      connectionMode.value = "ready"
    } catch (error) {
      runtimeFailed = true
      connectionMode.value = "error"
      fail(error)
    }
  }

  const ready = initialize()

  async function restart() {
    await ready
    await runtime.close()
    for (const conversation of conversations.value) conversation.active = false
    runtime = createRuntime()
    runtimeFailed = false
    connectionMode.value = "starting"
    await initialize()
  }

  async function prepare(conversation: Conversation): Promise<string> {
    if (conversation.dshHome !== runtimeHome) throw new Error("这个会话属于另一个 DSH_HOME，请新建会话或切回原来的 Harness home")
    if (conversation.sessionId && conversation.active) return conversation.sessionId
    if (!conversation.preparing) {
      conversation.preparing = (async () => {
        if (runtimeFailed) await restart()
        await runtime.start()
        if (conversation.sessionId) {
          const resumed = await runtime.resumeSession(conversation.sessionId, conversation.cwd)
          if (resumed.configOptions) conversation.configOptions = resumed.configOptions
        } else {
          const created = await runtime.newSession(conversation.cwd)
          conversation.sessionId = created.sessionId
          conversation.configOptions = created.configOptions ?? []
        }
        conversation.active = true
        for (const [id, value] of [["model", model.value], ["reasoning_effort", reasoning.value]] as const) {
          if (currentValue(conversation, id) !== value) {
            const result = await runtime.setConfig(conversation.sessionId!, id, value)
            conversation.configOptions = result.configOptions
          }
        }
      })()
    }
    try {
      await conversation.preparing
    } finally {
      conversation.preparing = undefined
    }
    if (!conversation.sessionId) throw new Error("dsh 没有返回会话 ID")
    return conversation.sessionId
  }

  function newConversation() {
    const conversation = createConversation(workspace.value, runtimeHome)
    conversations.value.push(conversation)
    activeId.value = conversation.id
    query.value = ""
    scheduleSave()
    void prepare(conversation).catch(fail)
  }

  function selectConversation(id: string) {
    const conversation = conversations.value.find(item => item.id === id && item.dshHome === runtimeHome)
    if (!conversation) return
    activeId.value = id
    scheduleSave()
    void prepare(conversation).catch(fail)
  }

  async function send(text = active.value.draft ?? "") {
    const content = text.trim()
    const conversation = active.value
    if (!content || conversation.running || disposed) return
    conversation.running = true
    conversation.stopRequested = false
    const assistantCount = conversation.items.filter(item => item.kind === "message" && item.role === "assistant").length
    const firstPrompt = !conversation.items.some(item => item.kind === "message" && item.role === "user")
    const user: ChatMessage = {
      kind: "message", id: `user-${crypto.randomUUID()}`, role: "user", content,
      status: "done", createdAt: Date.now(), source: "dsh",
    }
    if (firstPrompt) conversation.title = titleFor(content)
    conversation.items.push(user)
    conversation.draft = ""
    conversation.updatedAt = Date.now()
    scheduleSave()
    let submitted = false
    try {
      const sessionId = await prepare(conversation)
      if (conversation.stopRequested || disposed) {
        conversation.items = conversation.items.filter(item => item.id !== user.id)
        if (!conversation.draft) conversation.draft = content
        return
      }
      submitted = true
      const response = await runtime.prompt(sessionId, content)
      const assistant = lastAssistant(conversation)
      if (assistant) {
        assistant.status = response.stopReason === "cancelled" ? "stopped"
          : response.stopReason === "end_turn" || response.stopReason === "max_tokens" ? "done" : "error"
        if (response.stopReason === "refusal") assistant.error = "dsh 拒绝了这次请求"
        if (response.stopReason === "max_turn_requests") assistant.error = "已达到本轮最大请求次数"
      } else if (response.stopReason === "cancelled") {
        conversation.items.push({ kind: "message", id: `assistant-${crypto.randomUUID()}`, role: "assistant", content: "", status: "stopped", createdAt: Date.now(), source: "dsh" })
      }
    } catch (error) {
      if (!submitted) conversation.items = conversation.items.filter(item => item.id !== user.id)
      const assistant = lastAssistant(conversation)
      if (assistant && conversation.items.filter(item => item.kind === "message" && item.role === "assistant").length > assistantCount) {
        assistant.status = disposed ? "stopped" : "error"
        if (!disposed) assistant.error = errorMessage(error, [runtimeApiKey, options.baseUrl ?? ""])
      } else if (!disposed) {
        conversation.items.push({
          kind: "message", id: `assistant-${crypto.randomUUID()}`, role: "assistant", content: "",
          status: "error", createdAt: Date.now(), source: "dsh",
          error: errorMessage(error, [runtimeApiKey, options.baseUrl ?? ""]),
        })
      }
    } finally {
      conversation.running = false
      conversation.updatedAt = Date.now()
      persistNow()
    }
  }

  async function stop() {
    const conversation = active.value
    conversation.stopRequested = true
    if (conversation.sessionId) cancelPermission(conversation.sessionId)
    if (!conversation.sessionId || !conversation.active) {
      conversation.running = false
      return
    }
    try {
      await runtime.cancel(conversation.sessionId)
    } catch (error) {
      fail(error)
    }
  }

  async function retry() {
    const conversation = active.value
    if (conversation.running) return
    const lastUser = conversation.items.findLast(item => item.kind === "message" && item.role === "user")
    if (lastUser?.kind === "message") await send(lastUser.content)
  }

  async function deleteConversation(id: string) {
    const conversation = conversations.value.find(item => item.id === id)
    if (!conversation) return
    if (conversation.sessionId) cancelPermission(conversation.sessionId)
    conversation.stopRequested = true
    try {
      if (conversation.sessionId && conversation.active) await runtime.closeSession(conversation.sessionId)
    } catch (error) {
      fail(error)
    }
    conversation.active = false
    conversation.running = false
    conversations.value.splice(conversations.value.indexOf(conversation), 1)
    if (activeId.value === id) activeId.value = conversations.value.find(item => item.dshHome === runtimeHome)?.id ?? ""
    if (!conversations.value.some(item => item.dshHome === runtimeHome)) {
      const draft = createConversation(workspace.value, runtimeHome)
      conversations.value.push(draft)
      activeId.value = draft.id
    }
    scheduleSave()
  }

  async function setConfig(id: string, value: string) {
    if (id === "model") model.value = value
    else reasoning.value = value
    try {
      const sessionId = await prepare(active.value)
      const result = await runtime.setConfig(sessionId, id, value)
      active.value.configOptions = result.configOptions
      scheduleSave()
    } catch (error) {
      fail(error)
    }
  }

  async function setModel(value: string) { await setConfig("model", value) }
  async function setReasoning(value: string) { await setConfig("reasoning_effort", value) }
  function setThinking(value: boolean) { void setReasoning(value ? "high" : "off") }

  async function reconnect() {
    connectionMode.value = "starting"
    notice.value = null
    try {
      await restart()
    } catch (error) {
      fail(error)
    }
  }

  async function updatePreferences(values: { apiKey?: string; workspace?: string; dshHome?: string }) {
    let homeChanged = false
    let reconnectNeeded = false
    if (values.apiKey !== undefined) {
      runtimeApiKey = values.apiKey.trim()
      reconnectNeeded = true
    }
    if (values.workspace !== undefined) {
      const next = resolve(values.workspace)
      if (!statSync(next).isDirectory()) throw new Error("工作区不是有效目录")
      if (next !== workspace.value) {
        workspace.value = next
        reconnectNeeded = true
      }
    }
    if (values.dshHome !== undefined) {
      const next = resolve(values.dshHome)
      if (next !== dshHome.value) {
        dshHome.value = next
        homeChanged = true
      }
    }
    if (reconnectNeeded) await reconnect()
    if (homeChanged) notice.value = "DSH_HOME 已保存，将在下次启动时使用；已有会话仍属于原来的 Harness home。"
    scheduleSave()
  }

  function setApiKey(value: string) {
    void updatePreferences({ apiKey: value })
  }

  async function setWorkspace(value: string) {
    await updatePreferences({ workspace: value })
  }

  function setDshHome(value: string) {
    dshHome.value = resolve(value)
    scheduleSave()
    notice.value = "DSH_HOME 已保存，将在下次启动时使用；已有会话仍属于原来的 Harness home。"
  }

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise
    disposed = true
    for (const sessionId of pendingPermissions.keys()) cancelPermission(sessionId)
    pendingPermissions.clear()
    pendingPermission.value = null
    persistNow()
    runtimeApiKey = ""
    disposePromise = runtime.close()
    return disposePromise
  }

  return {
    conversations,
    active,
    activeId,
    filteredConversations,
    query,
    draft: computed({
      get: () => active.value.draft ?? "",
      set: (value: string) => { active.value.draft = value; scheduleSave() },
    }),
    model: modelValue,
    modelLabel,
    modelOptions,
    reasoning: reasoningValue,
    reasoningOptions,
    thinking,
    workspace,
    dshHome,
    updatePreferences,
    connectionMode,
    isStreaming,
    notice,
    pendingPermission,
    hasEnvironmentKey: Boolean(environmentApiKey),
    ready,
    send,
    retry,
    stop,
    newConversation,
    selectConversation,
    deleteConversation,
    setModel,
    setReasoning,
    setThinking,
    setApiKey,
    setWorkspace,
    setDshHome,
    reconnect,
    respondPermission,
    persistNow,
    dispose,
  }
}

export type ChatStore = ReturnType<typeof createChatStore>
