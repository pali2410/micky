const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function localEndpoint(value) {
  const url = new URL(value || 'http://127.0.0.1:11434/v1');
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('A loopback model endpoint is required');
  return url.toString().replace(/\/$/, '');
}
async function configure(repo, env = process.env) {
  const endpoint = localEndpoint(env.BOPS_LOCAL_LLM_URL);
  const response = await fetch(endpoint + '/models', {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw Error('Local model catalog unavailable');
  const models = (await response.json()).data.map(model => model.id);
  if (!models.length) throw Error('No local models installed');
  let selections={};try{selections=JSON.parse(fs.readFileSync(path.join(repo,'.data/model-selection.json'),'utf8'));}catch{}
  const model = selections.worker || env.BOPS_WORKER_MODEL || env.BOPS_LOCAL_MODEL || (models.includes('qwen2.5:3b') ? 'qwen2.5:3b' : models[0]);
  if (!models.includes(model)) throw Error('Selected local model is not installed');
  const rakazo = path.join(repo, 'Rakazo', '.env');
  if (!fs.existsSync(rakazo)) {
    const password = crypto.randomBytes(24).toString('hex');
    const secret = () => crypto.randomBytes(32).toString('hex');
    const settings = {NODE_ENV:'production',POSTGRES_USER:'rakazo',POSTGRES_DB:'rakazo',POSTGRES_PASSWORD:password,DATABASE_URL:`postgres://rakazo:${password}@127.0.0.1:5433/rakazo`,BETTER_AUTH_SECRET:secret(),ENCRYPTION_KEY:secret(),SCREEN_PROXY_SECRET:secret(),SANDBOX_SUPERVISOR_TOKEN:secret(),BETTER_AUTH_URL:'http://127.0.0.1:5173',API_URL:'http://127.0.0.1:3100',API_HOST:'127.0.0.1',WEB_ORIGIN:'http://127.0.0.1:5173',DATA_DIR:'./data',SANDBOX_PROVIDER:'docker',SANDBOX_CONTROL_VIA_LOOPBACK:'true',SANDBOX_SUPERVISOR_URL:'http://127.0.0.1:7091',WAKEUP_DRIVER:'graphile',AGENT_RUNTIME:'pi',CLOUD_AGENT_PROVIDER:'none',PI_DEFAULT_PROVIDER:'local',PI_DEFAULT_MODEL:model,RAKAZO_LOCAL_MODELS:models.join(','),RAKAZO_LOCAL_MODELS_URL:endpoint,RAKAZO_LOCAL_VISION_MODELS:models.filter(id=>id.includes('vl')).join(','),VITE_MICKY_LOCAL_ONLY:'1',PUBLIC_POSTHOG_KEY:''};
    fs.writeFileSync(rakazo,Object.entries(settings).map(([key,value])=>key+'='+value).join('\n')+'\n',{flag:'wx'});
  }
  if(fs.existsSync(rakazo)&&selections.worker){let contents=fs.readFileSync(rakazo,'utf8');contents=contents.replace(/^PI_DEFAULT_MODEL=.*$/m,'PI_DEFAULT_MODEL='+model).replace(/^RAKAZO_LOCAL_MODELS=.*$/m,'RAKAZO_LOCAL_MODELS='+models.join(','));fs.writeFileSync(rakazo,contents);}
  return {endpoint,model,models};
}
module.exports = {configure,localEndpoint};
