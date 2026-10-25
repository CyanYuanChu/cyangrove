# 模块结构与维护

本次拆分将产品边界与仓库边界对齐：一个工作台、五个独立软件。每个模块的仓库包含全部构建源码、原生 UI、自己的入口、资源、自检和构建脚本；没有引用父仓库的相对路径或依赖其他模块。

`Hub/` 是工作台，`Resources/modules.json` 是发布目录。UI 不再构造 SystemMonitor、CodexStore、QuickCommandService 或 PassportBridgeStore。详细设置、图表和功能由独立模块窗口承载，工作台显示它们返回的摘要。

## 控制协议 v1

Unix socket 位于 `/tmp/cyan-modules-<uid>/<module-id>.sock`，父目录权限 0700、socket 0600。启动时验证目录归属、类型和权限；通过 `flock` 防止同一用户重复实例。请求和响应均为一行 JSON，上限 64 KiB，读写超时 3 秒。

请求示例：

```json
{"protocolVersion":1,"action":"status"}
```

响应包含 `protocolVersion`、`id`、`version`、`ok`、`pid`、`integrated` 和 `summary`。控制动作包括 `status`、`show`、`refresh`、`quit`、`integrated`、`standalone`。Command 额外支持 `panel`；Passport 的 `start` 和 `stop` 只控制其自行启动或确认归属的桥接进程。未知动作被拒绝，不接受 shell 命令、任意路径或推理输入。

工作台退出不会关闭模块。合并菜单栏的模块每 10 秒检查工作台是否存活，失联时恢复独立菜单栏，因此工作台崩溃也不会让运行中的模块失去入口。

每个仓库中少量协议、启动和样式源码随项目附带，属于构建时复用。用户无需额外安装共享运行库。协议变化需要明确提高版本并保留兼容边界。

## 数据归属

| 模块 | 数据 |
| --- | --- |
| Command | 自己的 UserDefaults；翻译内容仅在内存 |
| Monitor | 自己的显示设置；采样仅在内存 |
| Codex Usage | `~/Library/Application Support/CyanCodexUsage` |
| GitHub | 既有 `~/Library/Application Support/GitGrove` 缓存与独立账户设置 |
| Passport | `~/Library/Application Support/CyanPassport` |
| Grove | `CyanGroveHub` 安装暂存目录与工作台自己的启用列表 |

迁移不会删除旧资料，不迁移旧 PID、运行状态或日志来假装接管旧进程。私钥、令牌和本机会话不在源码与安装包中。Codex CLI 和 GitHub CLI 的登录仍由它们自己管理。

## 发布

模块各自独立版本化。每个预览 Release 包含 App ZIP、`module.json` 与 `SHA256SUMS`。清单中的 `sha256` 指向 ZIP。工作台包内目录锁定已验证版本，可通过显式检查更新发现后续版本。

目前只在本机 Apple Silicon Mac 验证，未做 Intel 或最低系统版本实机验收。GitHub Widget 扩展完成编译和签名检查；系统组件库添加仍须在实际桌面单独验收。语音桥拆分不代表已完成新设备配对与长时语音验收。

正式公开版还需 Developer ID 签名、公证及相应机型验收。仓库的 CI 在 macOS runner 上独立构建和自检；下载依赖与外部服务另行验证。
