import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';

export const AGENTS = {
  codex: ['Codex', '@agentclientprotocol/codex-acp/dist/index.js'],
  claude: ['Claude Code', '@agentclientprotocol/claude-agent-acp/dist/index.js'],
  pi: ['Pi', 'pi-acp/dist/index.js']
};
const here = dirname(fileURLToPath(import.meta.url));
export const activeProcesses = new Set();
function terminate(child) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1200);
  timer.unref();
}
export function stopAgents() { for (const child of activeProcesses) terminate(child); }

// ACP v1: newline-delimited JSON-RPC over stdio, separate from the HTTP bridge.
export async function promptAgent({ agent = 'codex', model = '', prompt, systemPrompt = '', timeoutMs = 180000 }, { runtime, signal, command } = {}) {
  if (!Object.hasOwn(AGENTS, agent)) throw new Error('请选择 Codex、Pi 或 Claude Code');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('提示词不能为空');
  if (prompt.length + systemPrompt.length > 500000) throw new Error('提示词过长');
  if (typeof model !== 'string' || model.length > 200) throw new Error('模型名称无效');
  const cwd = await mkdtemp(join(tmpdir(), 'cyan-tab-acp-'));
  let child, timer, abort, failure;
  const pending = new Map();
  let nextId = 1, buffer = '', text = '', sessionId, startupInfo = null, denied = false;
  const decoder = new StringDecoder('utf8');
  const fail = error => {
    failure ||= error;
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    terminate(child);
  };
  try {
    if (signal?.aborted) throw new Error('ACP 请求已取消');
    const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}` };
    if (agent === 'codex') {
      env.INITIAL_AGENT_MODE = 'read-only';
      env.NO_BROWSER = '1';
      env.CODEX_CONFIG = JSON.stringify({ sandbox_mode: 'read-only', approval_policy: 'never', web_search: 'disabled', features: { shell_tool: false } });
    }
    if (agent === 'pi') env.PI_ACP_PI_COMMAND = join(here, 'pi-no-tools.sh');
    const executable = command?.[0] || process.execPath;
    const args = command ? command.slice(1) : [join(runtime, 'node_modules', AGENTS[agent][1])];
    child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    activeProcesses.add(child);
    child.stderr.resume(); // Never expose logs that may contain auth material to the browser.
    child.stdin.on('error', () => fail(new Error(`${AGENTS[agent][0]} ACP 连接已断开`)));
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    child.on('error', error => fail(new Error(`无法启动 ${AGENTS[agent][0]} ACP：${error.code || '启动失败'}`)));
    child.on('exit', (code, sig) => fail(new Error(`${AGENTS[agent][0]} ACP 已退出（${sig || code}），请检查适配器安装和登录状态`)));
    child.stdout.on('data', chunk => {
      try {
        buffer += decoder.write(chunk);
        if (Buffer.byteLength(buffer) > 2 * 1024 * 1024) throw new Error('ACP 消息过大');
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
          if (!line) continue;
          const message = JSON.parse(line);
          if (message.method && Object.hasOwn(message, 'id')) {
            if (message.method === 'session/request_permission') {
              denied = true;
              send({ jsonrpc: '2.0', id: message.id, result: { outcome: { outcome: 'cancelled' } } });
            } else send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'This client only accepts text output' } });
          } else if (message.method === 'session/update') {
            const update = message.params?.update;
            if (sessionId && message.params.sessionId === sessionId && update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
              if (update.content.text === startupInfo) continue;
              text += update.content.text;
              if (Buffer.byteLength(text) > 750000) throw new Error('ACP 输出过长');
            }
          } else if (Object.hasOwn(message, 'id')) {
            const request = pending.get(message.id);
            if (!request) continue;
            pending.delete(message.id);
            if (message.error) {
              const error = new Error(message.error.code === -32000 || /auth|login|credential/i.test(message.error.message || '')
                ? `${AGENTS[agent][0]} 需要登录，请先在终端完成该 Agent 的登录再测试连接`
                : `${AGENTS[agent][0]} ACP：${String(message.error.message || '请求失败').slice(0, 500)}`);
              request.reject(error);
            } else request.resolve(message.result);
          }
        }
      } catch (error) { fail(new Error(`ACP 响应无效：${error.message}`)); }
    });
    const request = (method, params) => new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      const id = nextId++; pending.set(id, { resolve, reject });
      send({ jsonrpc: '2.0', id, method, params });
    });
    timer = setTimeout(() => fail(new Error('ACP 请求超时，请检查 Agent 登录、网络或缩小标签范围')), Math.max(100, Math.min(180000, Number(timeoutMs) || 180000)));
    abort = () => fail(new Error('ACP 请求已取消'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const init = await request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'cyan-tab-grouper', version: '0.7.1' } });
    if (init.protocolVersion !== 1) throw new Error('Agent 不支持 ACP v1');
    const params = { cwd, mcpServers: [] };
    if (agent === 'claude') params._meta = { claudeCode: { options: { tools: [], allowedTools: [], settingSources: [], persistSession: false } } };
    const session = await request('session/new', params);
    startupInfo = session._meta?.piAcp?.startupInfo || null;
    sessionId = session.sessionId;
    if (typeof sessionId !== 'string') throw new Error('ACP 没有返回会话 ID');
    if (session.modes?.availableModes?.some(mode => mode.id === 'read-only')) await request('session/set_mode', { sessionId, modeId: 'read-only' });
    if (model.trim()) await request('session/set_model', { sessionId, modelId: model.trim() });
    text = ''; // Exclude startup messages from the model result.
    const result = await request('session/prompt', { sessionId, prompt: [{ type: 'text', text: `${systemPrompt}\n\n仅根据下方数据回复；不要读取文件、使用工具或执行命令。只返回所要求的 JSON。\n\n${prompt}` }] });
    if (denied) throw new Error('Agent 请求了额外工具权限，本次未执行标签操作');
    if (result.stopReason !== 'end_turn') throw new Error(`ACP 输出未完成（${result.stopReason || '未知原因'}），本次未执行标签操作`);
    if (!text.trim()) throw new Error('Agent 返回了空响应');
    return { text, agent, model: model || session.models?.currentModelId || null };
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    if (child) { terminate(child); activeProcesses.delete(child); }
    await rm(cwd, { recursive: true, force: true });
  }
}
