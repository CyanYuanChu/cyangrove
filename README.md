# Cyan Grove

macOS 个人工具工作台。功能按需下载安装和更新，**完整功能直接在 Grove 窗口内使用**。

每个功能仓库提供同一份原生功能包和一个独立版 App。Grove 动态加载功能包中的界面与业务逻辑；独立版使用同一个功能包。Grove 本身不内置五项业务实现，也不需要启动其他 App 来显示功能页面。

## 开始使用

从 [Releases](https://github.com/CyanYuanChu/cyangrove/releases) 下载 Grove。打开「功能管理」，开启需要的功能：未安装时自动从对应 GitHub 仓库下载功能包，随后在侧栏和当前窗口里直接使用。

| 功能 | 仓库 |
| --- | --- |
| 快速指令 | [cyan-command](https://github.com/CyanYuanChu/cyan-command) |
| 系统监控 | [cyan-monitor](https://github.com/CyanYuanChu/cyan-monitor) |
| Codex 驾驶舱 | [cyan-codex-usage](https://github.com/CyanYuanChu/cyan-codex-usage) |
| GitHub 足迹与桌面组件 | [cyan-github](https://github.com/CyanYuanChu/cyan-github) |
| AI Passport | [cyan-passport](https://github.com/CyanYuanChu/cyan-passport) |

只想使用一项能力的人，可以从对应仓库 Releases 下载独立版 App，不需要安装 Grove。

## 安装、开启与更新

- 功能包名称包含 `-module-`，安装到 Grove 的应用数据目录，不会额外安装五个独立软件。
- 侧栏进入功能后，显示模块提供的完整原生页面：翻译、系统图表、Codex 额度/日历/导出、GitHub 账户和提交、Passport 配对与配置均在 Grove 内操作。
- 功能开关控制采集、快捷键和桥接生命周期；停用后停止本模块的后台工作。关闭 Grove 窗口保留菜单栏和已开启功能，退出 Grove 则停止它托管的功能。
- 更新模块无需重新下载 Grove。为安全保留 Swift 原生代码和类型元数据，已加载模块的新版本在重启 Grove 后生效；更新前的功能可以继续使用。
- 模块卸载保留设置和历史。Grove 与独立版共用模块自己的设置和数据，单实例锁避免两边同时占用功能。

GitHub 模块首次启用时会注册一个不显示业务窗口的 WidgetKit 支持程序，用于 macOS 桌面组件。点击组件返回 Grove 的 GitHub 页面；使用其他功能无需打开该支持程序。

## 版本和环境

当前为 Apple Silicon 开发预览版。Grove 最低 macOS 14，快速指令需要 macOS 15 和系统英中语言包。全局快捷键需要给 Grove 授予辅助功能权限。Codex 和 GitHub 使用本机 CLI 正常登录；Passport 的 Python 运行环境可在 Grove 页面中准备。

预览包使用 ad hoc 签名，未做 Developer ID 公证，系统可能阻止首次打开。请勿关闭系统安全保护；常规免拦截分发需要后续正式签名与公证。

原整合版正在通话时，新的 Passport 页面不会接管或停止原桥接。结束旧通话并停止旧版后，再启动新桥接。旧版 Grove 尚未退出时，新的 Command 页面可翻译，但暂不重复注册全局快捷键。

## 开发

工作台单独构建，不需要其他仓库：

```sh
./scripts/build-modular.sh
./scripts/check-modular.sh
```

模块仓库各自使用 `./scripts/build.sh` 和 `./scripts/check.sh`，产出 `.groveplugin` 和复用它的独立 `.app`。

完整集成验收（可选）：

```sh
python3 scripts/checkout-modules.py cyan-command cyan-monitor cyan-codex-usage cyan-github cyan-passport
python3 scripts/test-native-modules.py
```

接口、更新和生命周期见 [docs/modules.md](docs/modules.md)。
