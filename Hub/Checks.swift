import Foundation
import AppKit
import CryptoKit

@MainActor enum HubChecks {
    static func run() async {
        var failed=0;var passed=0
        func check(_ value:Bool,_ name:String){print((value ? "PASS ":"FAIL ")+name);if value{passed+=1}else{failed+=1}}
        let center=ModuleCenter()
        check(center.modules.count==5 && Set(center.modules.map(\.id)).count==5,"five unique optional modules")
        check(center.modules.allSatisfy{$0.protocolVersion==1 && $0.sha256.count==64 && $0.repository.hasPrefix("CyanYuanChu/")},"pinned releases and protocol")
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("cyan-hub-test-"+UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:root)}
        do {
            try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
            let app=root.appendingPathComponent("Fixture.app"),contents=app.appendingPathComponent("Contents"),exe=contents.appendingPathComponent("MacOS/Fixture")
            try FileManager.default.createDirectory(at:exe.deletingLastPathComponent(),withIntermediateDirectories:true)
            try FileManager.default.copyItem(at:Bundle.main.executableURL!,to:exe)
            let plist:[String:Any] = ["CFBundleIdentifier":"io.github.cyanyuanchu.fixture","CFBundleExecutable":"Fixture","CFBundleName":"Fixture","CFBundlePackageType":"APPL","CFBundleShortVersionString":"0.1.0"]
            try PropertyListSerialization.data(fromPropertyList:plist,format:.xml,options:0).write(to:contents.appendingPathComponent("Info.plist"))
            try ModuleFiles.run("/usr/bin/codesign",["--force","--sign","-",app.path])
            let zip=root.appendingPathComponent("fixture.zip");try ModuleFiles.run("/usr/bin/ditto",["-c","-k","--keepParent",app.path,zip.path])
            let hash=SHA256.hash(data:try Data(contentsOf:zip)).map{String(format:"%02x",$0)}.joined()
            var m=center.modules[0];m.id="cyan-test-fixture";m.name="Fixture";m.appName="Fixture.app";m.bundleID="io.github.cyanyuanchu.fixture";m.version="0.1.0-preview.1";m.minMacOS="14.0";m.sha256=hash
            let apps=root.appendingPathComponent("Applications"),support=root.appendingPathComponent("Support")
            try ModuleFiles.install(zip,module:m,applicationsRoot:apps,supportRoot:support)
            check(ModuleFiles.matches(apps.appendingPathComponent(m.appName),m),"valid package installs in isolated fixture")
            m.sha256=String(repeating:"0",count:64)
            do{try ModuleFiles.install(zip,module:m,applicationsRoot:apps,supportRoot:support);check(false,"corrupt package rejected")}catch{check(true,"corrupt package rejected")}
            m.sha256=hash;m.bundleID="io.github.cyanyuanchu.wrong"
            do{try ModuleFiles.install(zip,module:m,applicationsRoot:apps,supportRoot:support);check(false,"wrong bundle identity rejected")}catch{check(true,"wrong bundle identity rejected")}
            m.bundleID="io.github.cyanyuanchu.fixture"
            check(ModuleFiles.matches(apps.appendingPathComponent(m.appName),m),"failed update preserves previous installation")
            m.appName="../Escape.app"
            do{try ModuleFiles.install(zip,module:m,applicationsRoot:apps,supportRoot:support);check(false,"path traversal rejected")}catch{check(true,"path traversal rejected")}
            m.appName="Fixture.app";m.protocolVersion=2
            do{try ModuleFiles.install(zip,module:m,applicationsRoot:apps,supportRoot:support);check(false,"incompatible protocol rejected")}catch{check(true,"incompatible protocol rejected")}
        }catch{check(false,"installer fixtures: "+error.localizedDescription)}
        print("HUB_TESTS \(passed) passed, \(failed) failed");if failed>0{exit(1)}
    }
}
