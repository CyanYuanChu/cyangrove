#!/usr/bin/env python3
"""Check out only the official module source repositories requested by the developer."""
from pathlib import Path
import json,subprocess,sys
root=Path(__file__).resolve().parent.parent
catalog={m['id']:m for m in json.loads((root/'Resources/modules.json').read_text())}
if not sys.argv[1:]:raise SystemExit('Usage: python3 scripts/checkout-modules.py cyan-command [cyan-monitor ...]')
for ident in sys.argv[1:]:
 if ident not in catalog:raise SystemExit('Unknown module: '+ident)
 dest=root/'modules'/ident
 if dest.exists():print('Exists:',dest);continue
 dest.parent.mkdir(exist_ok=True)
 subprocess.run(['git','clone','https://github.com/'+catalog[ident]['repository']+'.git',str(dest)],check=True)
