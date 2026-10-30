import { defineComponent, onMounted, onBeforeUnmount, ref } from "vue"
import { Button } from "@gpuiv/animal-island"
import { useGpuix, isPackaged } from "@gpuiv/vue"
import { checkUpdate, currentVersion, downloadUpdate, installUpdate, type AppRelease } from "../services/app-updates"
import { palette } from "../theme"

export const UpdateNotice = defineComponent({
  props: { busy: { type: Boolean, default: false } },
  setup(props, { expose }) {
    const { renderer } = useGpuix()
    const appImage = isPackaged() ? process.env.APPIMAGE : undefined
    const release = ref<AppRelease>(), message = ref(""), downloading = ref(false), checking = ref(false), downloaded = ref("")
    const controller = new AbortController()
    let timer: ReturnType<typeof setInterval> | undefined
    async function check(manual = false) {
      if (checking.value || downloading.value) return
      checking.value = true
      try {
        const next = await checkUpdate(controller.signal)
        if (controller.signal.aborted) return
        if (next?.version !== release.value?.version) downloaded.value = ""
        release.value = next
        message.value = next ? `发现新版本 v${next.version}（当前 v${currentVersion}）` : manual ? `当前已是最新版本 v${currentVersion}` : ""
      } catch (error) { if (manual && !controller.signal.aborted) message.value = String(error) }
      finally { checking.value = false }
    }
    async function download() {
      if (!release.value || downloading.value) return
      downloading.value = true
      try {
        downloaded.value = await downloadUpdate(release.value, fraction => { message.value = `正在下载更新 ${Math.round(fraction * 100)}%` }, controller.signal)
        message.value = "更新已下载并通过 SHA256 校验"
      } catch (error) { if (!controller.signal.aborted) message.value = String(error) }
      finally { downloading.value = false }
    }
    async function install() {
      if (props.busy || !downloaded.value || !appImage || downloading.value) return
      downloading.value = true
      try { await installUpdate(downloaded.value, appImage); message.value = "更新已安装，关闭后重新打开应用即可生效"; downloaded.value = ""; release.value = undefined }
      catch (error) { message.value = `${String(error)}；可前往发布页手动更新` }
      finally { downloading.value = false }
    }
    expose({ check: () => { void check(true) } })
    onMounted(() => { void check(); timer = setInterval(() => { void check() }, 6 * 60 * 60 * 1000) })
    onBeforeUnmount(() => { controller.abort(); if (timer) clearInterval(timer) })
    return () => message.value ? <div testId="update-notice" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: 10, backgroundColor: palette.mintPale, flexShrink: 0 }}>
      <text style={{ flexGrow: 1, fontSize: 12, color: palette.body }}>{message.value}</text>
      {release.value ? <Button type="text" size="small" onClick={() => renderer?.openUrl?.(release.value!.url)}>{{ default: () => <text>更新说明</text> }}</Button> : null}
      {release.value && !downloaded.value ? <Button size="small" loading={downloading.value} onClick={() => { void download() }}>{{ default: () => <text>下载更新</text> }}</Button> : null}
      {downloaded.value && appImage ? <Button size="small" disabled={props.busy || downloading.value} onClick={() => { void install() }}>{{ default: () => <text>{props.busy ? "任务结束后安装" : "安装更新"}</text> }}</Button> : null}
      {downloaded.value && !appImage ? <text style={{ fontSize: 12, userSelect: "text", color: palette.body }}>已保存至 {downloaded.value}，可手动启动 AppImage</text> : null}
      {!downloading.value ? <Button type="text" size="small" onClick={() => { message.value = "" }}>{{ default: () => <text>稍后</text> }}</Button> : null}
    </div> : null
  },
})
