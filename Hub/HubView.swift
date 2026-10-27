import SwiftUI
import AppKit

struct EmbeddedFeatureView:NSViewControllerRepresentable {
    let controller:NSViewController
    func makeNSViewController(context:Context)->NSViewController{controller}
    func updateNSViewController(_ controller:NSViewController,context:Context){}
}
struct HubView:View {
    @ObservedObject var center:ModuleCenter
    @ObservedObject var startup:StartupManager
    let p=GrovePalette()
    var body:some View{
        HStack(spacing:0){sidebar
            VStack(spacing:0){
                toolbar
                if center.selected=="tab-bridge"{
                    TabBridgePage()
                }else if let m=center.modules.first(where:{$0.id==center.selected}){
                    featurePage(m)
                }else{
                    ScrollView{VStack(alignment:.leading,spacing:24){
                        if center.selected=="settings"{settings}
                        else if let m=center.modules.first(where:{"manage:"+$0.id==center.selected}){management(m)}
                        else{home}
                    }.padding(30).frame(maxWidth:1100).frame(maxWidth:.infinity)}
                }
            }.frame(maxWidth:.infinity,maxHeight:.infinity).background(p.background)
        }.foregroundStyle(p.text).frame(minWidth:1120,minHeight:760).preferredColorScheme(.light)
    }
    var sidebar:some View{
        VStack(alignment:.leading,spacing:10){
            HStack{GroveMark(size:36);VStack(alignment:.leading){Text("Cyan Grove").font(.title3.bold());Text("YOUR WORKSPACE").font(.system(size:8)).tracking(1.6).foregroundStyle(p.secondary)}}.padding(.bottom,24)
            nav("我的 Grove",icon:"square.grid.2x2",id:"home")
            nav("功能管理",icon:"shippingbox",id:"modules")
            Text("工作空间").font(.caption).foregroundStyle(p.secondary).padding(.top,18)
            nav("浏览器桥接",icon:"network",id:"tab-bridge")
            ForEach(center.modules.filter{center.active.contains($0.id)}){m in nav(title(m),icon:m.icon,id:m.id)}
            Spacer()
            Text("需要的能力，留在这里。\n按需开启，专心使用。").font(.system(size:12)).foregroundStyle(p.secondary).lineSpacing(7).padding(.bottom,16)
            nav("偏好设置",icon:"slider.horizontal.3",id:"settings")
            Link("GitHub",destination:URL(string:"https://github.com/CyanYuanChu/cyangrove")!).font(.caption).foregroundStyle(p.accent).padding(.leading,12)
        }.padding(22).frame(width:210).frame(maxHeight:.infinity).background(p.sidebar)
    }
    var toolbar:some View{
        HStack{
            Text(center.modules.first(where:{$0.id==center.selected}).map(title) ?? (center.selected=="tab-bridge" ? "浏览器桥接":center.selected=="settings" ? "偏好设置":center.selected=="home" ? "我的 Grove":"功能管理")).font(.system(size:14,weight:.semibold))
            Spacer()
            if let m=center.modules.first(where:{$0.id==center.selected}){
                Button("刷新"){Task{await center.action(m,"refresh")}}.disabled(!center.active.contains(m.id))
                Button("模块设置"){center.selected="manage:"+m.id}
            }
            Text("PREVIEW · 0.9.0 (2)").font(.system(size:10,design:.monospaced)).foregroundStyle(p.secondary)
        }.padding(.horizontal,28).frame(height:64).background(p.card)
    }
    func title(_ m:ModuleDescriptor)->String{["cyan-command":"快速指令","cyan-monitor":"系统监控","cyan-codex-usage":"Codex 驾驶舱","cyan-github":"GitHub 足迹","cyan-passport":"AI Passport"][m.id] ?? m.name}
    func nav(_ label:String,icon:String,id:String)->some View{
        Button{center.selected=id}label:{HStack(spacing:10){Image(systemName:icon).frame(width:20);Text(label).font(.system(size:12,weight:center.selected==id ? .semibold:.regular));Spacer()}.padding(12).foregroundStyle(center.selected==id ? p.accent:p.secondary).background(center.selected==id ? p.card:.clear,in:RoundedRectangle(cornerRadius:10))}.buttonStyle(.plain)
    }
    var home:some View{
        VStack(alignment:.leading,spacing:24){
            SectionHeading(eyebrow:"YOUR PERSONAL GROVE",title:center.selected=="modules" ? "开启你需要的功能。":"让日常，顺手一点。",subtitle:"安装模块后，完整功能就在 Grove 内使用。每项能力也可独立发布和更新。")
            HStack(spacing:18){stat("已安装",String(center.modules.filter{ModuleFiles.installed($0) != nil}.count));stat("已开启",String(center.active.count));Spacer();Button("检查模块更新"){Task{await center.checkUpdates()}}}
            if let notice=center.notice{Text(notice).font(.callout).foregroundStyle(p.accent).padding(14).frame(maxWidth:.infinity,alignment:.leading).background(p.soft,in:RoundedRectangle(cornerRadius:12))}
            LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:18){ForEach(center.modules){m in moduleCard(m)}}
        }
    }
    func stat(_ name:String,_ value:String)->some View{VStack(alignment:.leading,spacing:8){Text(name).font(.caption).foregroundStyle(p.secondary);Text(value).font(.system(size:28,weight:.medium,design:.rounded))}.padding(18).frame(width:140,alignment:.leading).background(p.card,in:RoundedRectangle(cornerRadius:16))}
    func moduleCard(_ m:ModuleDescriptor)->some View{
        let installed=ModuleFiles.installed(m) != nil;let active=center.active.contains(m.id)
        return VStack(alignment:.leading,spacing:14){
            HStack{Image(systemName:m.icon).font(.system(size:24,weight:.light)).foregroundStyle(p.accent).frame(width:46,height:46).background(p.soft,in:RoundedRectangle(cornerRadius:12));Spacer();Toggle("开启"+title(m),isOn:Binding(get:{active},set:{v in Task{await center.setEnabled(m,v)}})).labelsHidden().toggleStyle(.switch).tint(p.accent).disabled(center.busy.contains(m.id) || !m.supported)}
            Text(title(m)).font(.system(size:20,weight:.medium));Text(m.description).font(.system(size:12)).foregroundStyle(p.secondary)
            if active,let s=center.snapshots[m.id]{ForEach(s.summary.keys.sorted().prefix(2),id:\.self){key in HStack{Text(key).foregroundStyle(p.secondary);Spacer();Text(s.summary[key] ?? "—").lineLimit(1)}.font(.system(size:11))}}
            else{Text(installed ? "已安装，开启后出现在工作空间。":"开启时自动下载对应功能包。").font(.system(size:11)).foregroundStyle(p.secondary).frame(height:32,alignment:.topLeading)}
            if let error=center.errors[m.id]{Text(error).font(.caption).foregroundStyle(.orange).fixedSize(horizontal:false,vertical:true)}
            if center.needsRestart(m){Text("新版已就绪，重启 Grove 后生效。").font(.caption).foregroundStyle(p.accent)}
            Divider()
            HStack{
                if center.busy.contains(m.id){ProgressView().controlSize(.small);Text("处理中…").font(.caption)}
                else{Button(active ? "进入功能":installed ? "开启功能":"安装并开启"){Task{await center.open(m)}}.buttonStyle(.borderedProminent).tint(p.accent).disabled(!m.supported)}
                Spacer();Button("管理"){center.selected="manage:"+m.id}.buttonStyle(.borderless).foregroundStyle(p.secondary)
            }
        }.padding(22).frame(maxWidth:.infinity,alignment:.leading).background(p.card,in:RoundedRectangle(cornerRadius:20))
    }
    @ViewBuilder func featurePage(_ m:ModuleDescriptor)->some View{
        if let controller=center.controller(m.id){
            VStack(spacing:0){
                if center.needsRestart(m){Text("新版本已安装，当前功能继续运行；重启 Grove 后使用新版。").font(.caption).foregroundStyle(p.accent).padding(10)}
                EmbeddedFeatureView(controller:controller).id(m.id).frame(maxWidth:.infinity,maxHeight:.infinity)
            }
        }else{
            VStack(spacing:20){GroveMark(size:56);Text(title(m)).font(.title);Text(center.errors[m.id] ?? "开启后即可在此使用完整功能。").foregroundStyle(p.secondary);Button("安装并开启"){Task{await center.setEnabled(m,true)}}.buttonStyle(.borderedProminent).tint(p.accent).disabled(center.busy.contains(m.id));if center.busy.contains(m.id){ProgressView()};Button("查看模块设置"){center.selected="manage:"+m.id}}.padding(40).frame(maxWidth:.infinity,maxHeight:.infinity)
        }
    }
    func management(_ m:ModuleDescriptor)->some View{
        VStack(alignment:.leading,spacing:24){
            SectionHeading(eyebrow:"MODULE SETTINGS",title:title(m),subtitle:"功能和界面随模块安装，使用时始终留在 Grove。")
            moduleCard(m)
            HStack{Text("已安装版本："+(ModuleFiles.installedDescriptor(m)?.version ?? "未安装"));Spacer();Text("可用版本："+m.version)}.font(.callout).foregroundStyle(p.secondary)
            HStack{
                Button("安装 / 更新模块"){Task{await center.install(m)}}.buttonStyle(.borderedProminent).tint(p.accent)
                Button("检查更新"){Task{await center.checkUpdates()}}
                Spacer();Button("卸载模块",role:.destructive){Task{await center.uninstall(m)}}
            }.disabled(center.busy.contains(m.id))
            Text("模块更新无需重新下载 Grove。已加载的原生模块在下次启动 Grove 时切换到新版，当前页面可以继续使用。关闭功能会停止它的采集与服务；卸载保留配置和历史。").font(.callout).foregroundStyle(p.secondary).lineSpacing(6)
            Divider()
            HStack{VStack(alignment:.leading,spacing:8){Text("独立使用").font(.headline);Text("分享给只需要这项能力的人，可下载同一仓库的独立版 App。").font(.callout).foregroundStyle(p.secondary)};Spacer();Link("下载独立版",destination:m.standaloneURL)}
            Link("查看模块源码",destination:m.repositoryURL).font(.caption)
        }
    }
    var settings:some View{VStack(alignment:.leading,spacing:24){SectionHeading(eyebrow:"PREFERENCES",title:"由你安排。",subtitle:"工作台只运行你开启的功能。关闭窗口后继续在后台工作，退出 Grove 时停止本应用的功能。")
        StartupSettingsView(manager:startup,p:p)
        Text("功能包保存在本机应用数据目录，不需要额外安装或打开独立 App。模块的设置在 Grove 和独立版之间共用。").font(.callout).foregroundStyle(p.secondary).lineSpacing(6)
    }}
}
