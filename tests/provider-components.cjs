const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file, modules={}) { const exports={}; new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>modules[name],exports);return exports; }
const safety=load('vendor/openmaus/shared/provider-safety.ts');
const retry=load('vendor/openmaus/server/drivers/retry.ts',{'../../shared/provider-safety':safety});
const protocol=load('vendor/openmaus/server/drivers/openai-chat-protocol.ts');
assert.equal(retry.classifyError(new Error('HTTP 503 service unavailable')).transient,true);
assert.equal(retry.classifyError(new Error('HTTP 401 unauthorized')).transient,false);
assert.equal(retry.classifyError(new Error('cancelled by user')).transient,false);
assert.equal(retry.classifyError(new Error('HTTP 503 blocked by our safety systems')).transient,false);
const malformed=new protocol.ChatToolCalls(); malformed.add([{id:'same',type:'function',function:{name:'start_task',arguments:'{}'}},{id:'same',type:'function',function:{name:'start_task',arguments:'{}'}}],false);
assert.throws(()=>malformed.finish('tool_calls',false),/duplicate/);
const truncated=new protocol.ChatToolCalls(); truncated.add([{id:'one',type:'function',function:{name:'start_task',arguments:'{}'}}],false); assert.throws(()=>truncated.finish('length',false),/truncated/);
const controller=new AbortController(); const waiting=retry.interruptibleDelay(10000,controller.signal);controller.abort();waiting.promise.then(result=>{assert.equal(result,'cancelled');console.log('PASS: upstream transient/terminal retry classification, cancellation, duplicate/truncated tool-call rejection.');});
