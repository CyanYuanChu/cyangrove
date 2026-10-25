import SwiftUI
import AppKit

@MainActor final class HubDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    let center=ModuleCenter();let startup=StartupManager();let server=ModuleServer()
    var window:NSWindow?;var item:NSStatusItem?;var timer:Timer?
    func applicationDidFinishLaunching(_ notification:Notification) {
        do {
            guard try server.start(id:"cyangrove",handler:{ [weak self] action in
                if action == "show" {self?.show()}
                return ["protocolVersion":1,"id":"cyangrove","ok":true,"installed":self?.center.modules.filter{ModuleFiles.installed($0) != nil}.count ?? 0]
            }) else {Task.detached {_ = try? ModuleIPC.request("cyangrove",action:"show");await MainActor.run{NSApp.terminate(nil)}};return}
        } catch {print(error.localizedDescription);NSApp.terminate(nil);return}
        let w=NSWindow(contentRect:NSRect(x:0,y:0,width:1180,height:880),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        w.title="Cyan Grove · 模块工作台";w.contentView=NSHostingView(rootView:HubView(center:center,startup:startup));w.center();w.isReleasedWhenClosed=false;w.delegate=self;window=w
        item=NSStatusBar.system.statusItem(withLength:NSStatusItem.variableLength)
        let menu=NSMenu();menu.addItem(withTitle:"打开 Cyan Grove",action:#selector(show),keyEquivalent:"")
        menu.addItem(withTitle:"模块中心",action:#selector(modules),keyEquivalent:"")
        menu.addItem(.separator());menu.addItem(withTitle:"退出工作台（模块继续运行）",action:#selector(quit),keyEquivalent:"q")
        for entry in menu.items{entry.target=self};item?.menu=menu
        let main=NSMenu();let a=NSMenuItem();a.submenu=menu;main.addItem(a);NSApp.mainMenu=main
        updateItem();center.start()
        timer=Timer.scheduledTimer(withTimeInterval:2,repeats:true){[weak self] _ in Task{@MainActor in self?.updateItem()}}
        if !GroveLaunchContext.shouldStartQuietly(arguments:CommandLine.arguments,event:NSAppleEventManager.shared().currentAppleEvent){show()}else{NSApp.setActivationPolicy(.accessory)}
    }
    func updateItem(){
        item?.button?.image=NSImage(systemSymbolName:"leaf",accessibilityDescription:"Cyan Grove")
        var parts:[String]=[]
        if let monitor=center.snapshots["cyan-monitor"],monitor.running {
            for key in ["CPU","内存","下载","上传"] {if let value=monitor.summary[key] {parts.append((key == "下载" ? "↓":key == "上传" ? "↑":key)+" "+value)}}
        }
        if let codex=center.snapshots["cyan-codex-usage"],codex.running,let value=codex.summary["剩余额度"] {parts.append("Codex "+value)}
        item?.button?.title=parts.isEmpty ? "":" "+parts.joined(separator:"  ");item?.button?.font=NSFont.monospacedDigitSystemFont(ofSize:10,weight:.regular)
        item?.button?.toolTip="Cyan Grove · 运行中 \(center.snapshots.values.filter(\.running).count) 个模块"
    }
    @objc func show(){NSApp.setActivationPolicy(.regular);NSApp.activate(ignoringOtherApps:true);window?.makeKeyAndOrderFront(nil)}
    @objc func modules(){center.selected="modules";show()}
    @objc func quit(){NSApp.terminate(nil)}
    func applicationWillTerminate(_ notification:Notification){timer?.invalidate();server.stop()}
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{false}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool{show();return true}
    func application(_ application:NSApplication,open urls:[URL]){center.selected="modules";show()}
}

@main struct CyanGroveHub {
    @MainActor static func main() async {
        let args=CommandLine.arguments
        if args.contains("--self-test") {
            await HubChecks.run(); return
        }
        if let i=args.firstIndex(of:"--install-local"),args.count>i+2 {
            let center=ModuleCenter();guard let m=center.modules.first(where:{$0.id==args[i+1]}) else{exit(1)}
            await center.install(m,local:URL(fileURLWithPath:args[i+2]));if let error=center.errors[m.id]{print(error);exit(1)};print("INSTALL_OK "+m.id);return
        }
        let app=NSApplication.shared;let delegate=HubDelegate();app.delegate=delegate;withExtendedLifetime(delegate){app.run()}
    }
}
