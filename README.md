# mini dsh

一个小巧的 DeepSeek dsh 桌面客户端，使用 Vue 3、TypeScript、GPUIV 和 Animal Island 构建原生 GPU 界面，不嵌入 Chromium 或 WebView。

mini dsh 是基于官方 dsh 的独立客户端，不是 DeepSeek 官方产品。

## 特点

- **dsh 核心**：通过 Agent Client Protocol（ACP）使用官方 DeepSeek Harness，复用 Agent 循环、工具、插件、权限与会话持久化。
- **原生界面**：Vue 3 / TSX 驱动 GPUIV，Animal Island 提供界面组件。
- **接续官方数据**：新安装默认使用 `~/.dsh`，可发现并通过 ACP 恢复官方会话；已有 mini dsh 数据不会被强制迁移。
- **流式工具时间线**：显示回复、思考、工具调用和上下文用量，支持取消、重试、权限确认和消息复制。
- **精简桌面分发**：提供 Linux x64 单文件 AppImage，内嵌固定版本的 dsh 运行时。

## 架构

```text
Vue 3 + TypeScript + Animal Island
                │
             GPUIV / GPUI
                │
       Agent Client Protocol SDK
                │
       官方 dsh（--profile acp）
```

mini dsh 只维护桌面界面、ACP 适配和界面缓存，不另行实现一套 Agent harness。

## 数据与迁移

- `DSH_HOME` 环境变量优先，其次是界面保存的选择；新用户默认使用官方 `~/.dsh`。
- 已有用户可在设置中选择 **“使用官方 ~/.dsh”**，保存后重启应用。
- 不同 home 的会话分别显示，旧目录中的缓存不会删除。
- 凭据和官方会话由 dsh 管理，mini dsh 不复制或解析官方凭据文件。
- 界面缓存独立保存在当前工作目录的 `.mini-dsh/ui-v2.json`。
- ACP 可以恢复会话并继续对话，但不回放早期消息；这些会话会显示相应提示。
- 官方 Web 特有的插件、profile 和完整工作台面不保证自动迁移。避免在两个客户端中同时写入同一会话。

## 从源码运行

需要 Bun、uv，以及可构建 GPUIV 的开发环境。当前开发构建仍使用相邻的 GPUIV 源码 checkout；Animal Island 和 GPUIV packager 尚未作为独立 npm 包发布。

```bash
git clone --recurse-submodules https://github.com/liuyanghejerry/gpuiv.git
git clone https://github.com/liuyanghejerry/mini-dsh.git

cd gpuiv
bun install
bun run build
cd packages/animal-island
bun run build

cd ../../../mini-dsh
bun install
bun run setup:dsh
bun run build
bun run start
```

`bun run setup:dsh` 通过 uv 安装固定的 `deepseek-harness-runtime-bin==0.2.1rc2`。GPUIV 位于其他目录时，可设置 `GPUIV_ROOT` 或修改 `package.json` 中的 `gpuiv.root`。

## 打包

```bash
# 原生 Linux 可执行文件和 tar.gz
bun run package

# 同时生成 Linux x64 AppImage
bun run package:appimage
```

AppImage 输出为 `dist/package/mini-dsh-0.1.0-linux-x86_64.AppImage`。打包包含 `LICENSE`、`NOTICE` 和 `licenses/`，不包含本地会话、凭据或测试工作区。

当前 AppImage 面向 Linux x64；本机原生构建要求 glibc 2.43+，并依赖系统 X11/XKB。旧发行版需要另做兼容构建。首次运行会释放内嵌的 dsh 运行时。

## 验证

```bash
bun run build
bun run package:appimage
```

发布前还应进行纯内存或 headless 的 ACP 回归和 AppImage 挂载检查。不要用真实账号凭据做自动化测试；GUI 验证与无窗口回归应分开进行。

## License 与 Credits

mini dsh 自有代码采用 [MIT License](LICENSE)。第三方组件仍遵循各自许可证，详见 [NOTICE](NOTICE) 和 [licenses/](licenses/)。

**Animal Island 的上游声明包含学习与非商业使用限制，GPUIV 移植版也遵循该约束。因此，包含这些组件的整体分发和使用仍需遵守该约束；自有代码的 MIT 许可证不代表整个应用可无条件商业使用。**

主要致谢：

- [GPUIV](https://github.com/liuyanghejerry/gpuiv)：Vue 3 自定义渲染器、原生 GPUI 集成和 Animal Island 移植，Apache-2.0；同时保留其 GPUIX、GPUI、Comet 等上游声明。
- [Animal Island Vue](https://github.com/guokaigdg/animal-island-vue)：原始 Vue UI 库，作者 guokaigdg，MIT 及上游使用声明。
- [Animal Island UI](https://github.com/guokaigdg/animal-island-ui)：React 组件、图形资产与交互参考，作者 guokaigdg。
- [Vue](https://github.com/vuejs/core)：Vue 3 与响应式系统，MIT。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：官方 dsh 和 ACP harness，MIT；其依赖保留各自的许可证。
- [Agent Client Protocol TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)：ACP 客户端协议支持，Zed Industries，Apache-2.0。
