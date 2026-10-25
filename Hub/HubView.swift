import SwiftUI
import AppKit

struct HubView: View {
    @ObservedObject var center: ModuleCenter
    @ObservedObject var startup: StartupManager
    let p = GrovePalette()
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack { GroveMark(size: 36); VStack(alignment:.leading) { Text("Cyan Grove").font(.title3.bold()); Text("YOUR MODULES").font(.system(size:8)).tracking(2).foregroundStyle(p.secondary) } }.padding(.bottom,28)
                nav("我的 Grove",icon:"square.grid.2x2",id:"home")
                nav("模块中心",icon:"shippingbox",id:"modules")
                Text("已安装的能力").font(.caption).foregroundStyle(p.secondary).padding(.top,22)
                ForEach(center.modules.filter { ModuleFiles.installed($0) != nil }) { m in nav(m.name.replacingOccurrences(of:"Cyan ",with:""),icon:m.icon,id:m.id) }
                Spacer()
                Text("按需安装，独立运行。\n让工具顺着你的习惯生长。").font(.system(size:12)).foregroundStyle(p.secondary).lineSpacing(7).padding(.bottom,20)
                nav("偏好设置",icon:"slider.horizontal.3",id:"settings")
                Link("GitHub 项目",destination:URL(string:"https://github.com/CyanYuanChu/cyangrove")!).font(.caption).foregroundStyle(p.accent).padding(.leading,12)
            }.padding(24).frame(width:220).frame(maxHeight:.infinity).background(p.sidebar)
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    HStack { Text(center.selected == "home" ? "我的 Grove" : center.selected == "settings" ? "偏好设置" : "模块中心").font(.caption).foregroundStyle(p.secondary); Spacer(); Text("PREVIEW · 0.8.0").font(.system(size:10,design:.monospaced)).foregroundStyle(p.accent) }
                    if center.selected == "settings" { settings }
                    else if let m=center.modules.first(where:{$0.id==center.selected}) { detail(m) }
                    else {
                        VStack(alignment:.leading,spacing:10) {
                            Text(center.selected == "home" ? "你的工具，刚刚好。" : "选择需要的能力。").font(.system(size:32,weight:.medium))
                            Text("每个模块都是独立软件。在这里安装、查看状态和控制，也可以单独打开使用。").font(.system(size:13)).foregroundStyle(p.secondary).lineSpacing(5)
                        }.padding(.vertical,8)
                        HStack(spacing:20) { summary("已安装",String(center.modules.filter{ModuleFiles.installed($0) != nil}.count)); summary("运行中",String(center.snapshots.values.filter(\.running).count)); summary("可选模块",String(center.modules.count)); Spacer(); Button("检查更新") { Task { await center.checkUpdates() } }.buttonStyle(.bordered) }
                        if let notice=center.notice { Text(notice).font(.callout).foregroundStyle(p.accent).padding(16).frame(maxWidth:.infinity,alignment:.leading).background(p.soft,in:RoundedRectangle(cornerRadius:12)) }
                        LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],alignment:.leading,spacing:18) { ForEach(center.modules) { card($0) } }
                        Text("当前安装包为 Apple Silicon 开发预览版，尚未做 Developer ID 公证。系统权限由各模块单独申请。").font(.caption).foregroundStyle(p.secondary).lineSpacing(5)
                    }
                }.padding(32).frame(maxWidth:1080).frame(maxWidth:.infinity,alignment:.center)
            }.background(p.background)
        }.foregroundStyle(p.text).frame(minWidth:1100,minHeight:740).preferredColorScheme(.light)
    }
    func nav(_ title:String,icon:String,id:String)->some View {
        Button { center.selected=id } label: { HStack(spacing:10) { Image(systemName:icon).frame(width:20);Text(title).font(.system(size:12,weight:center.selected==id ? .semibold:.regular));Spacer() }.padding(12).foregroundStyle(center.selected==id ? p.accent:p.secondary).background(center.selected==id ? p.card:.clear,in:RoundedRectangle(cornerRadius:10)) }.buttonStyle(.plain)
    }
    func summary(_ title:String,_ value:String)->some View { VStack(alignment:.leading,spacing:8) { Text(title).font(.caption).foregroundStyle(p.secondary);Text(value).font(.system(size:27,weight:.medium,design:.rounded)) }.padding(18).frame(minWidth:120,alignment:.leading).background(p.card,in:RoundedRectangle(cornerRadius:16)) }
    func card(_ m:ModuleDescriptor)->some View {
        let installed=ModuleFiles.installed(m) != nil;let running=center.snapshots[m.id]?.running == true
        return VStack(alignment:.leading,spacing:15) {
            HStack { Image(systemName:m.icon).font(.system(size:24,weight:.light)).foregroundStyle(p.accent).frame(width:48,height:48).background(p.soft,in:RoundedRectangle(cornerRadius:13));Spacer();Circle().fill(running ? Color.green:p.secondary.opacity(0.3)).frame(width:7,height:7);Text(running ? "运行中":installed ? "已安装":"未安装").font(.caption).foregroundStyle(p.secondary) }
            Text(m.name).font(.system(size:19,weight:.semibold));Text(m.description).font(.system(size:12)).foregroundStyle(p.secondary)
            if running,let snapshot=center.snapshots[m.id] { ForEach(snapshot.summary.keys.sorted().prefix(3),id:\.self) { key in HStack {Text(key).foregroundStyle(p.secondary);Spacer();Text(snapshot.summary[key] ?? "—").lineLimit(1)}.font(.system(size:11)).frame(height:16) } }
            else { Text(installed ? "准备好了，按需启用。":"从你的 GitHub Releases 安装，数据保存在本机。").font(.system(size:11)).foregroundStyle(p.secondary).frame(height:48,alignment:.topLeading) }
            if let error=center.errors[m.id] {Text(error).font(.caption).foregroundStyle(.orange).fixedSize(horizontal:false,vertical:true)}
            Divider().overlay(p.line)
            HStack(spacing:10) {
                if center.busy.contains(m.id) {ProgressView().controlSize(.small);Text("处理中…").font(.caption)}
                else if !m.supported {Text("需要 macOS "+m.minMacOS).font(.caption)}
                else if !installed {Button("安装模块") {Task {await center.install(m)}}.buttonStyle(.borderedProminent).tint(p.accent)}
                else {
                    Button(running ? "打开":"启动") {Task {await center.launch(m,show:true)}}.buttonStyle(.borderedProminent).tint(p.accent)
                    Button("管理") {center.selected=m.id}.buttonStyle(.bordered)
                    if running { Button("停止") {Task {await center.setEnabled(m,false)}}.buttonStyle(.borderless).foregroundStyle(p.secondary) }
                }
                Spacer();Link(destination:m.repositoryURL) {Image(systemName:"arrow.up.right")}.foregroundStyle(p.secondary)
            }.font(.system(size:11)).disabled(center.busy.contains(m.id))
        }.padding(22).frame(maxWidth:.infinity,alignment:.leading).background(p.card,in:RoundedRectangle(cornerRadius:20))
    }
    func detail(_ m:ModuleDescriptor)->some View {
        VStack(alignment:.leading,spacing:22) {
            SectionHeading(eyebrow:"INDEPENDENT MODULE",title:m.name,subtitle:m.description)
            card(m)
            if ModuleFiles.installed(m) != nil {
                Toggle("随 Grove 启动并合并菜单栏",isOn:Binding(get:{center.enabled.contains(m.id)},set:{v in Task {await center.setEnabled(m,v)}})).toggleStyle(.switch).tint(p.accent)
                Text("模块只运行一个实例。Grove 退出后模块继续运行；点击停止才结束它。详细功能和系统权限在模块自己的窗口中设置。").font(.callout).foregroundStyle(p.secondary).lineSpacing(5)
                HStack {
                    Button("独立显示菜单栏") {Task {await center.action(m,"standalone")}}
                    Button("合并到 Grove") {Task {await center.action(m,"integrated")}}
                    Button("刷新数据") {Task {await center.action(m,"refresh")}}
                    if m.id == "cyan-command" {Button("打开指令面板") {Task {await center.action(m,"panel")}}}
                }.disabled(center.snapshots[m.id]?.running != true)
                HStack {
                    Button("安装目录中的版本") {Task {await center.install(m)}}.disabled(center.snapshots[m.id]?.running == true)
                    Button("在 Finder 中显示") {if let app=ModuleFiles.installed(m) {NSWorkspace.shared.activateFileViewerSelecting([app])}}
                    Spacer();Button("卸载到废纸篓",role:.destructive) {Task {await center.uninstall(m)}}
                }.disabled(center.busy.contains(m.id))
                Text("卸载保留配置和历史。模块版本：\(center.snapshots[m.id]?.version ?? "—") · 目录版本：\(m.version) · 协议 v\(m.protocolVersion)").font(.caption).foregroundStyle(p.secondary)
            }
        }
    }
    var settings:some View {
        VStack(alignment:.leading,spacing:24) {
            SectionHeading(eyebrow:"PREFERENCES",title:"由你安排。",subtitle:"Grove 只管理你选择安装和启用的能力。")
            StartupSettingsView(manager:startup,p:p)
            Text("模块装在 ~/Applications，各自保存配置。新安装不会自动启用；勾选随 Grove 启动后，才会在下次登录或打开 Grove 时恢复。").font(.callout).foregroundStyle(p.secondary).lineSpacing(6)
            Text("此前整合版正在使用的 Passport 通话不会由这个工作台接管。请结束通话并退出旧版后，再启用独立 Passport，避免占用相同设备端口。").font(.callout).foregroundStyle(p.secondary).lineSpacing(6)
        }
    }
}
