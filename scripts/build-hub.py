#!/usr/bin/env python3
from pathlib import Path
import plistlib,os,subprocess,shutil
R=Path(__file__).resolve().parent.parent
app=R/'build/Cyan Grove.app';c=app/'Contents';exe=c/'MacOS/Cyan Grove'
if app.exists():shutil.rmtree(app)
exe.parent.mkdir(parents=True);(c/'Resources').mkdir()
for name in ['modules.json','CyanGroveLeaf.icns']:shutil.copy2(R/'Resources'/name,c/'Resources'/name)
bridge=R/'extensions/ai-tab-grouper/bridge'
shutil.copytree(bridge,c/'Resources/TabBridge',ignore=shutil.ignore_patterns('node_modules','*.log'))
with (c/'Info.plist').open('wb') as f:plistlib.dump(dict(CFBundleIdentifier='io.github.cyanyuanchu.cyangrove',CFBundleName='Cyan Grove',CFBundleExecutable='Cyan Grove',CFBundlePackageType='APPL',CFBundleShortVersionString='0.9.0',CFBundleVersion='2',CFBundleIconFile='CyanGroveLeaf',LSMinimumSystemVersion='14.0',CFBundleURLTypes=[dict(CFBundleURLSchemes=['cyangrove-modules'])]),f)
sdk=subprocess.check_output(['xcrun','--sdk','macosx','--show-sdk-path'],text=True).strip()
subprocess.run(['xcrun','swiftc','-parse-as-library','-swift-version','5','-O','-sdk',sdk,'-target','arm64-apple-macosx14.0',*map(str,sorted((R/'Hub').glob('*.swift'))),'-o',str(exe)],check=True)
subprocess.run(['codesign','--force','--sign',os.environ.get('CODE_SIGN_IDENTITY','-'),str(app)],check=True)
print('BUILD_OK',app)
