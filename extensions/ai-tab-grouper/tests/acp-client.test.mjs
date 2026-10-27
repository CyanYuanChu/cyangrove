import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { promptAgent, activeProcesses } from '../bridge/acp.mjs';
const fixture = fileURLToPath(new URL('./fixtures/acp-agent.mjs',import.meta.url));
const run = (scenario, extra={}, signal) => promptAgent({agent:'codex',prompt:'test',timeoutMs:3000,...extra},{command:[process.execPath,fixture,scenario],signal});
test('ACP negotiates v1, selects model and only returns current-session message chunks',async()=>{
 const result = await run('ok',{model:'chosen'});
 assert.deepEqual(JSON.parse(result.text),{ok:true,text:'中文'});
 assert.equal(activeProcesses.size,0);
});
for (const [scenario, message] of [['permission',/额外工具权限/],['bad',/ACP 响应无效/],['truncated',/输出未完成/]]) {
 test(`ACP rejects ${scenario} before browser operations`,async()=>{ await assert.rejects(run(scenario),message);assert.equal(activeProcesses.size,0); });
}
test('ACP deadline stops hung adapter',async()=>{await assert.rejects(run('hang',{timeoutMs:200}),/请求超时/);assert.equal(activeProcesses.size,0);});
test('ACP caller cancellation stops adapter',async()=>{const controller=new AbortController();const pending=run('hang',{},controller.signal);setTimeout(()=>controller.abort(),150);await assert.rejects(pending,/已取消/);assert.equal(activeProcesses.size,0);});
test('ACP rejects unknown agents without spawning',async()=>{await assert.rejects(run('ok',{agent:'arbitrary-command'}),/请选择/);});
