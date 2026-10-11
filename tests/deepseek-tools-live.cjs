const assert=require('node:assert/strict');
const {ToolAgent}=require('../runtimes/deepseek/tool-agent.cjs');
const controller=new AbortController();
const deadline=setTimeout(()=>controller.abort(),120000);
const agent=new ToolAgent({model:'qwen2.5:3b',signal:controller.signal,
 prompt:'Use windows to list the current open windows. Then use finish to report the actual window titles. Do not open or change anything. Do not respond with prose; invoke tools.',
 tools:[{name:'windows',description:'List current visible Windows application titles.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'finish',description:'Finish with a result grounded in window titles returned by windows.',inputSchema:{type:'object',properties:{result:{type:'string'}},required:['result'],additionalProperties:false}}]});
(async()=>{
 const first=await agent.next({});console.log('First tool:',first.action);assert.equal(first.action,'windows');
 const actual=await(await fetch('http://127.0.0.1:8768/windows')).json();assert.ok(actual.windows.length);
 const second=await agent.next(actual);console.log('Next tool:',JSON.stringify({action:second.action,args:second.args}));assert.equal(second.action,'finish');
 assert.ok(actual.windows.some(w=>second.args.result.includes(w.title)), 'Finish must include at least one exact observed window title');
 console.log('PASS: upstream DeepSeek agent invoked native windows tool and finished using real observations.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{clearTimeout(deadline);await agent.close();});
