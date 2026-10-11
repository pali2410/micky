'use strict';
// Micky Windows modification: use the existing loopback model service, without
// downloading a second LLM or taking ownership of the shared Ollama process.
const { EventEmitter } = require('events');
class MickyRuntime extends EventEmitter {
  constructor() {
    super(); this.external = true; this.preparing = null; this.endpoint = null;
    this.tuning = { edge: 1024, cpuOnly: false }; this.queue = Promise.resolve();
    const url = new URL(process.env.MICKY_LOCAL_LLM_URL);
    if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('Micky requires a loopback model service');
    this.baseUrl = url.toString().replace(/\/v1\/?$/, '').replace(/\/$/, '');
  }
  get running() { return Boolean(this.endpoint); }
  status() { return { state: this.running ? 'ready' : 'stopped', percent: this.running ? 100 : 0, label: this.running ? `Local · ${this.endpoint.model}` : 'Connecting to local models' }; }
  async ensure() {
    if (this.endpoint && this.endpoint.model === process.env.MICKY_LOCAL_MODEL) return this.endpoint;
    const res = await fetch(this.baseUrl + '/v1/models', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw Error('Local model catalog unavailable');
    const models = (await res.json()).data.map(m => m.id);
    const model = process.env.MICKY_LOCAL_MODEL;
    if (!models.includes(model)) throw Error(`Local model ${model} is not installed`);
    this.endpoint = { baseUrl: this.baseUrl, apiKey: 'local', model, ctx: 16384 };
    this.emit('state', 'ready'); return this.endpoint;
  }
  async use(fn) { return fn(await this.ensure()); }
  exclusive(fn) { const run = this.queue.then(() => this.use(fn)); this.queue = run.catch(() => {}); return run; }
  preload() { this.ensure().catch(e => this.emit('state', 'stopped')); }
  warm() { this.preload(); }
  applyKeepLoaded() { this.preload(); }
  setPreparing(percent) { this.preparing = percent == null ? null : { percent }; this.emit('progress', this.status()); }
  async slot() { return false; }
  pruneCache() {}
  stop() { this.endpoint = null; this.emit('state', 'stopped'); }
}
module.exports = { MickyRuntime };
