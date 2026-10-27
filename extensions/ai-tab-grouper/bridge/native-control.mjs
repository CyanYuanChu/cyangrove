import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
const directory = join(homedir(), 'Library/Application Support/CyanGroveHub/TabBridge');
export function requestGrove(action) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(`/tmp/cyan-modules-${process.getuid()}/cyangrove.sock`);
    let data = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('Grove 控制请求超时')));
    socket.on('connect', () => socket.write(JSON.stringify({protocolVersion:1, action})+'\n'));
    socket.on('data', chunk => {
      data += chunk;
      if (data.length > 65536) return socket.destroy(new Error('控制响应过大'));
      if (!data.includes('\n')) return;
      try { resolve(JSON.parse(data.split('\n')[0])); socket.end(); } catch(error) { socket.destroy(error); }
    });
    socket.on('error', reject);
    socket.on('end', () => { if (!data.includes('\n')) reject(new Error('Grove 控制连接中断')); });
  });
}
async function health() {
  try { const response=await fetch('http://127.0.0.1:48765/health',{signal:AbortSignal.timeout(700)});const data=await response.json();return response.ok && data.service==='cyan-tab-acp'; } catch { return false; }
}
export async function controlBridge(action, { request=requestGrove, isRunning=health, launch=()=>exec('/usr/bin/open',['-g','-b','io.github.cyanyuanchu.cyangrove','--args','--background']), config=()=>readFile(join(directory,'config.json'),'utf8'), pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)) }={}) {
  if (!['start','stop','status'].includes(action)) throw new Error('不支持的桥接操作');
  if (action==='status') return {ok:true,running:await isRunning()};
  let result;
  try { result=await request(`tab-bridge:${action}`); }
  catch(error) {
    if(action==='stop') { if(await isRunning()) throw error;return {ok:true,running:false}; }
    await launch();
    for(let attempt=0;attempt<30;attempt++) {
      await pause(150);
      try { result=await request('tab-bridge:start');break; } catch {}
    }
    if(!result) throw new Error('无法启动 Cyan Grove，请确认应用已安装');
  }
  for(let attempt=0;attempt<25;attempt++) {
    const running=await isRunning();
    if(running===(action==='start')) {
      if(!running)return {ok:true,running:false};
      const saved=JSON.parse(await config());
      return {ok:true,running:true,token:saved.token};
    }
    if(result?.tabBridge?.error)throw new Error(result.tabBridge.error);
    await pause(100);
  }
  throw new Error(action==='start'?'桥接未能启动，请在 Cyan Grove 中安装 ACP 适配器后重试':'桥接尚未停止，请稍后重试');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input=Buffer.alloc(0),handled=false;
  const reply = value => {
    const data=Buffer.from(JSON.stringify(value));const header=Buffer.alloc(4);header.writeUInt32LE(data.length);
    process.stdout.write(Buffer.concat([header,data]),()=>process.exit(0));
  };
  const timeout=setTimeout(()=>reply({ok:false,message:'桥接控制超时，请检查 Cyan Grove'}),15000);
  process.stdin.on('data',async chunk=>{
    if(handled)return;
    input=Buffer.concat([input,chunk]);
    if(input.length<4)return;
    const length=input.readUInt32LE(0);
    if(length>65536){handled=true;return reply({ok:false,message:'控制消息过大'});}
    if(input.length<length+4)return;
    handled=true;
    try {
      const config=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));
      if(process.argv[2]!==`chrome-extension://${config.extensionId}/`)throw new Error('插件来源不匹配，请从 Cyan Grove 重新安装控制组件');
      const message=JSON.parse(input.subarray(4,length+4).toString('utf8'));
      const result=await controlBridge(message.action);clearTimeout(timeout);reply(result);
    } catch(error) {clearTimeout(timeout);reply({ok:false,message:error.message||'桥接控制失败'});}
  });
}
