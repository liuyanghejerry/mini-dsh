import { defineComponent, onBeforeUnmount, ref } from "vue"
import { Button, Tag, Tooltip, fonts, provideTheme } from "@gpuiv/animal-island"
import { useGpuix } from "@gpuiv/vue"
import { loadMiniDshFonts } from "./services/animal-fonts"
import { createChatStore } from "./state/chat"
import { Composer } from "./components/Composer"
import { Glyph } from "./components/Glyph"
import { PermissionDialog } from "./components/PermissionDialog"
import { SettingsDialog } from "./components/SettingsDialog"
import { Sidebar } from "./components/Sidebar"
import { Transcript } from "./components/Transcript"
import { WindowControls } from "./components/WindowControls"
import { palette } from "./theme"

export const App = defineComponent({
  name: "MiniDshApp",
  setup() {
    const { renderer } = useGpuix()
    loadMiniDshFonts(renderer)
    provideTheme()
    const store = createChatStore()
    const settingsOpen = ref(false)
    onBeforeUnmount(store.dispose)
    return () => <div testId="app-root" style={{
      userSelect: "none", position: "relative", display: "flex", flexDirection: "row", alignItems: "stretch",
      width: "100%", height: "100%", backgroundColor: palette.cream, color: palette.body,
      borderRadius: 14, overflow: "hidden",
      fontFamily: fonts.sans,
    }}>
      <Sidebar store={store} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0, minHeight: 0, height: "100%", backgroundColor: palette.cream }}>
        <div testId="main-header" windowDragRegion style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 12, minHeight: 60, paddingLeft: 32, paddingRight: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0, gap: 5 }}>
            <text style={{ fontSize: 18, fontWeight: 800, color: palette.ink }}>{store.active.value.title}</text>
          </div>
          <Tag size="small" variant="soft" color={store.connectionMode.value === "ready" ? "app-green" : "app-orange"}>
            {{ default: () => <text>{store.connectionMode.value === "ready" ? "DSH 内核" : store.connectionMode.value === "starting" ? "DSH 启动中" : "DSH 未连接"}</text> }}
          </Tag>
          <Tooltip title="连接与偏好设置" placement="bottom" variant="island">
            {{ default: () => <Button testId="settings" type="text" aria-label="设置" onClick={() => { settingsOpen.value = true }}
              icon={<Glyph name="settings" size={19} />} style={{ width: 36, height: 36, paddingLeft: 0, paddingRight: 0 }} /> }}
          </Tooltip>
          {process.platform !== "darwin" ? <WindowControls /> : null}
        </div>
        {store.notice.value ? <div testId="storage-notice" role="alert" style={{ flexShrink: 0, paddingTop: 9, paddingBottom: 9, paddingLeft: 20, paddingRight: 20, backgroundColor: palette.errorBg }}>
          <text style={{ userSelect: "text", fontSize: 12, lineHeight: 18, color: palette.error }}>{store.notice.value}</text>
        </div> : null}
        <Transcript conversation={store.active.value} onRetry={store.retry} onPrompt={store.send} onLoadOlder={store.loadOlder} />
        <Composer store={store} />
      </div>
      <SettingsDialog store={store} open={settingsOpen.value} onClose={() => { settingsOpen.value = false }} />
      <PermissionDialog request={store.pendingPermission.value} onRespond={store.respondPermission} />
    </div>
  },
})
