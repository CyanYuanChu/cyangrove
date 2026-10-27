import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBridge } from '../bridge/server.mjs';
const token='a'.repeat(64),extensionId='a'.repeat(32),origin=`chrome-extension://${extensionId}`;
test('loopback bridge enforces origin, host, token and parameters before invoking ACP',async()=>{
 const runtime=await mkdtemp(join(tmpdir(),'acp-http-test-'));
 const module=join(runtime,'node_modules/@agentclientprotocol/codex-acp/dist');await mkdir(module,{recursive:true});await writeFile(join(module,'index.js'),'');
 let calls=0;
 const server=await createBridge({token,extensionId,runtime},{runner:async body=>{calls++;assert.equal(body.agent,'codex');return {text:'{"ok":true}'};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const headers={Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const request=(body,custom={})=>fetch(base+'/v1/prompt',{method:'POST',headers:{...headers,...custom},body:JSON.stringify(body)});
 try {
  assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await request({agent:'codex',prompt:'hi'},{Origin:'https://evil.example'})).status,403);
  const badHost = await new Promise((resolve,reject)=>{const req=http.request(base+'/health',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(badHost,403);
  assert.equal((await request({agent:'codex',prompt:'hi'},{Authorization:'Bearer wrong'})).status,401);
  assert.equal((await request({agent:'shell',prompt:'hi'})).status,400);
  assert.equal((await request({agent:'codex',prompt:1})).status,400);
  assert.equal(calls,0);
  const result=await request({agent:'codex',prompt:'hi'});
  assert.equal(result.status,200);assert.equal(result.headers.get('access-control-allow-origin'),origin);assert.deepEqual(await result.json(),{text:'{"ok":true}'});assert.equal(calls,1);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(runtime,{recursive:true,force:true});}
});
test('bridge rejects concurrent work and propagates client disconnect to ACP',async()=>{
 const runtime=await mkdtemp(join(tmpdir(),'acp-cancel-test-'));
 const module=join(runtime,'node_modules/@agentclientprotocol/codex-acp/dist');await mkdir(module,{recursive:true});await writeFile(join(module,'index.js'),'');
 let begin, cancelled;const started=new Promise(resolve=>begin=resolve);const stopped=new Promise(resolve=>cancelled=resolve);
 const server=await createBridge({token,extensionId,runtime},{runner:async(_body,{signal})=>{begin();await new Promise(resolve=>signal.addEventListener('abort',()=>{cancelled();resolve();},{once:true}));throw Error('cancelled');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/v1/prompt`;
 const controller=new AbortController();const init={method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({agent:'codex',prompt:'hi'})};
 try {const pending=fetch(url,{...init,signal:controller.signal}).catch(()=>{});await started;assert.equal((await fetch(url,init)).status,409);controller.abort();await stopped;await pending;}
 finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(runtime,{recursive:true,force:true});}
});
