// Isolated provider conversations; no user chat/profile is modified by this check.
const assert=require('node:assert/strict');
process.env.MICKY_LOCAL_LLM_URL='http://127.0.0.1:11434/v1';
process.env.MICKY_LOCAL_MODEL='qwen2.5:3b';
process.env.MICKY_LOCAL_VISION_MODEL='qwen2.5vl:3b';
const {MickyRuntime}=require('../Bigfoot/src/main/local/micky-runtime');
const {LocalProvider}=require('../Bigfoot/src/main/llm/local');
(async()=>{
 const runtime=new MickyRuntime();assert.equal((await runtime.ensure()).model,'qwen2.5:3b');
 const provider=new LocalProvider({runtime,model:'qwen2.5:3b',system:'You are a test assistant. Follow exact instructions.',tools:[{name:'echo',description:'Echo a test string',input_schema:{type:'object',properties:{text:{type:'string'}},required:['text']}}],screen:{width:1000,height:1000}});
 await provider.warm();provider.addUserMessage('Call the echo tool with text "native fixture".');
 const answer=await provider.step(AbortSignal.timeout(60000));
 assert(answer.calls.some(c=>c.name==='echo'&&c.input.text==='native fixture'),'Local provider must return a real structured tool call');
 runtime.stop();assert.equal(runtime.running,false);
 assert((await fetch('http://127.0.0.1:11434/v1/models')).ok,'Stopping Bigfoot must leave the shared model service running');
 console.log('PASS: Bigfoot local tool call, runtime compatibility, shared service ownership');
})().catch(e=>{console.error(e);process.exitCode=1});
