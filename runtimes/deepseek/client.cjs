const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Documented DeepSeek SDK protocol. Runtime is isolated from Electron's Node version.
class HarnessClient {
  constructor({ model = 'phi4-mini:latest', root = path.resolve(__dirname, '../..'), execution=false, toolBridge='', toolToken='' } = {}) {
    this.execution=execution;this.toolBridge=toolBridge;this.toolToken=toolToken;
    this.pending = new Map(); this.events = new Map(); this.waiters = new Map(); this.sequence = 0; this.closing = false;
    fs.mkdirSync(path.join(root, '.logs'), { recursive: true });
    this.log = fs.createWriteStream(path.join(root, '.logs', 'deepseek-runtime.log'), { flags: 'a' });
    this.dead = false;
    this.ready = this.boot(model, root);
  }
  async boot(model, root) {
    const gatewayURL = await require('./gateway.cjs').ensureGateway();
    if (this.closing) throw new Error('DeepSeek startup cancelled');
    this.child = spawn(process.env.MICKY_NODE || 'node', [path.join(__dirname, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'sdk-minimal', '--patch', path.join(__dirname, this.execution?'execution.patch.yml':'micky.patch.yml')], {
      cwd: __dirname, windowsHide: true, stdio: ['pipe','pipe','pipe'],
      env: { ...process.env, DSH_HOME: path.join(root, '.data', 'deepseek'), MICKY_OLLAMA_KEY: 'ollama', MICKY_LLM_GATEWAY_URL: gatewayURL, MICKY_TOOL_BRIDGE:this.toolBridge, MICKY_TOOL_TOKEN:this.toolToken, MICKY_MCP_PATH:path.join(__dirname,'tools-mcp.cjs') },
    });
    this.child.stderr.pipe(this.log, { end: false });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let packet; try { packet = JSON.parse(line); } catch { this.log.write(line+'\n'); return; }
      if (packet.id !== undefined) {
        const entry = this.pending.get(packet.id);
        if (!entry) return;
        this.pending.delete(packet.id); clearTimeout(entry.timer);
        packet.error ? entry.reject(new Error(packet.error.message)) : entry.resolve(packet.result);
      } else if (packet.method === 'session.event') {
        const list = this.events.get(packet.params?.sessionId);
        if (list) list.push(packet.params.event);
      } else if (packet.method === 'session.status') {
        const waiter = this.waiters.get(packet.params?.sessionId);
        if (waiter && packet.params.status === 'running') waiter.running = true;
        if (waiter?.running && packet.params.status === 'idle') waiter.resolve();
      }
    });
    const stopped = error => {
      this.dead = true;
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
      this.pending.clear(); this.log.end();
      for (const waiter of this.waiters.values()) waiter.reject(error);
    };
    this.child.on('error', stopped);
    this.child.on('exit', code => stopped(new Error(`DeepSeek runtime exited (${code})`)));
    return this.request('initialize', { cwd: root, provider: 'micky-local', model, maxTokens: 900 }, 30000);
  }
  request(method, params, timeout = 90000) {
    return new Promise((resolve, reject) => {
      if (this.child.exitCode !== null || this.child.stdin.destroyed) return reject(new Error('DeepSeek runtime stopped'));
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`DeepSeek ${method} timed out`)); this.close(); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc:'2.0', id, method, params })+'\n');
    });
  }
  async run(prompt, signal = new AbortController().signal, existingSessionId) {
    const abort = () => this.close();
    signal.throwIfAborted(); signal.addEventListener('abort', abort, { once:true });
    const sessionId = existingSessionId || 'micky-'+randomUUID(); const events = []; this.events.set(sessionId, events);
    try {
      await this.ready; signal.throwIfAborted();
      const idle = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { reject(new Error('DeepSeek turn timed out')); this.close(); }, this.execution?600000:90000);
        this.waiters.set(sessionId, { running:false, cancel:()=>clearTimeout(timer), resolve:()=>{clearTimeout(timer);resolve();}, reject:error=>{clearTimeout(timer);reject(error);} });
      });
      // The published rc.2 protocol settles through lifecycle notifications.
      // The newer source-only session/wait method is not present in this release.
      // Attach a handler immediately so boot/enqueue failures cannot leave a rejected waiter unobserved.
      idle.catch(() => {});
      await this.request('session/prompt', { sessionId, contentBlocks:[{ type:'text', text:prompt }] });
      await idle; signal.throwIfAborted();
      const final = [...events].reverse().find(e => e.type === 'assistant/message');
      const text = final?.data?.message?.content?.filter(b => b.type === 'text').map(b=>b.text).join('');
      if (!text) {
        this.log.write(JSON.stringify({event:'missing-result',sessionId,events:events.slice(-12)})+'\n');
        throw new Error('DeepSeek completed without an assistant result');
      }
      return { text, sessionId, events };
    } finally { this.events.delete(sessionId); this.waiters.get(sessionId)?.cancel(); this.waiters.delete(sessionId); signal.removeEventListener('abort', abort); }
  }
  async close() {
    if (this.dead || this.closing) return;
    this.closing = true;
    this.dead = true;
    if (!this.child) return;
    try { await this.request('shutdown', undefined, 3000); } catch { this.child.kill(); }
    this.child.stdin.end();
  }
}
module.exports = { HarnessClient };
if (require.main === module) {
  const client = new HarnessClient({ model:'qwen2.5:3b' });
  client.run('Return exactly this JSON object: {"action":"windows","args":{}}').then(r => console.log(JSON.stringify({text:r.text,events:r.events.length}))).catch(e=>{ console.error(e);process.exitCode=1; }).finally(()=>client.close());
}
