import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AGENTS, promptAgent, stopAgents } from './acp.mjs';

export const defaultDirectory = join(homedir(), 'Library/Application Support/CyanGroveHub/TabBridge');
export async function createBridge(config, { runner = promptAgent } = {}) {
  if (!/^[a-f0-9]{64}$/.test(config.token || '')) throw new Error('桥接密钥无效');
  if (!/^[a-p]{32}$/.test(config.extensionId || '')) throw new Error('Chrome 扩展 ID 无效');
  const origin = `chrome-extension://${config.extensionId}`;
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); } };
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return send(403, { error: 'Invalid host' });
    if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Origin denied' });
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.url === '/health' && req.method === 'GET') return send(200, { ok: true, service: 'cyan-tab-acp', version: '0.7.1', busy });
    const auth = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${config.token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: '桥接密钥不匹配，请在 Cyan Grove 中点击「连接插件」' });
    if (req.url !== '/v1/prompt' || req.method !== 'POST') return send(404, { error: 'Not found' });
    if (busy) return send(409, { error: 'ACP 正在处理其他请求，请稍后再试' });
    busy = true;
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', cancel);
    const bodyTimer = setTimeout(() => req.destroy(), 10000);
    try {
      let raw = '', size = 0;
      req.setEncoding('utf8');
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > 750000) { send(413, { error: '请求过大' }); req.destroy(); return; }
        raw += chunk;
      }
      clearTimeout(bodyTimer);
      let body;
      try { body = JSON.parse(raw); } catch { return send(400, { error: '请求不是 JSON' }); }
      if (!body || !Object.hasOwn(AGENTS, body.agent) || typeof body.prompt !== 'string' || (body.systemPrompt != null && typeof body.systemPrompt !== 'string')) return send(400, { error: 'ACP 请求参数无效' });
      try { await access(join(config.runtime, 'node_modules', AGENTS[body.agent][1])); } catch { return send(503, { error: '请先在 Cyan Grove 中安装 ACP 适配器' }); }
      const result = await runner({ agent: body.agent, model: body.model || '', prompt: body.prompt, systemPrompt: body.systemPrompt || '', timeoutMs: body.timeoutMs }, { runtime: config.runtime, signal: controller.signal });
      send(200, result);
    } catch (error) { send(502, { error: error.message || 'ACP 请求失败' }); }
    finally { clearTimeout(bodyTimer); res.off('close', cancel); busy = false; }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configPath = process.argv[2] || join(defaultDirectory, 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.runtime ||= join(defaultDirectory, 'runtime');
  const server = await createBridge(config);
  server.on('error', error => { console.error(`BRIDGE_ERROR ${error.code || error.message}`); process.exit(1); });
  server.listen(48765, '127.0.0.1', () => console.log('BRIDGE_READY http://127.0.0.1:48765'));
  const stop = () => { stopAgents(); server.closeAllConnections(); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
