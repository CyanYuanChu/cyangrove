#!/usr/bin/env python3
"""Optional full integration test; each feature still builds without its parent repo."""
from pathlib import Path
import subprocess,concurrent.futures
root=Path(__file__).resolve().parent.parent
modules=sorted(p for p in (root/'modules').iterdir() if (p/'module.json').exists())
if len(modules)!=5:raise SystemExit('Check out all five modules using scripts/checkout-modules.py first')
def build(repo):
 log=repo/'native-integration-build.log'
 with log.open('w') as output:result=subprocess.run([str(repo/'scripts/build.sh')],cwd=repo,stdout=output,stderr=subprocess.STDOUT)
 if result.returncode:raise RuntimeError(repo.name+' build failed: '+str(log))
 subprocess.run([str(repo/'scripts/check.sh')],cwd=repo,check=True)
 subprocess.run(['python3',str(repo/'scripts/test-runtime.py')],cwd=repo,check=True)
 return repo.name
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for name in pool.map(build,modules):print('VERIFIED',name,flush=True)
subprocess.run([str(root/'scripts/build-modular.sh')],cwd=root,check=True)
subprocess.run([str(root/'build/Cyan Grove.app/Contents/MacOS/Cyan Grove'),'--verify-native-modules',str(root/'modules'),'--no-autostart','--no-shortcut','--no-widget-registration'],cwd=root,check=True)
