const http = require('node:http');
const { Readable } = require('node:stream');
let ready;
// Preserve the SDK streaming protocol while enforcing Micky's action JSON schema.
function ensureGateway() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      const abort = new AbortController(); response.on('close', () => abort.abort());
      try {
        if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return; }
        let size=0; const chunks=[];
        for await (const chunk of request) { size+=chunk.length; if(size>2000000) throw new Error('Oversized planner request'); chunks.push(chunk); }
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (body.tools?.length) body.parallel_tool_calls = false;
        if (body.tools?.some(tool => tool.function?.name?.startsWith('mcp__micky__'))) body.tool_choice = 'required';
        if (body.model === 'micky-tools-qwen3') body.reasoning_effort = 'none';
        const input=[...body.messages].reverse().find(m=>m.role==='user');
        const text=typeof input?.content==='string'?input.content:input?.content?.filter(b=>b.type==='text').map(b=>b.text).join('');
        let plan; try {plan=JSON.parse(text);} catch {}
        if (plan?.schema && Array.isArray(plan.messages)) {
          body.response_format={type:'json_schema',json_schema:{name:'micky_next_action',strict:true,schema:plan.schema}};
          // Send the actual task transcript, preserving its roles, rather than nested JSON text.
          body.messages=plan.messages;
          body.messages[0]={role:'system',content:body.messages[0].content+'\nReturn exactly one JSON action matching the required schema. No prose.'};
          body.temperature=0;
        }
        const base=(process.env.BOPS_LOCAL_LLM_URL || 'http://127.0.0.1:11434/v1').replace(/\/$/,'');
        const upstream=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(90000)])});
        response.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type') || 'application/json'});
        const source=Readable.fromWeb(upstream.body).on('error', error => response.destroy(error));
        if(body.tools?.length && body.stream && upstream.ok) source.pipe(require('./serial-tools.cjs').serialToolStream()).on('error',error=>response.destroy(error)).pipe(response);
        else source.pipe(response);
      } catch(error) {
        if(!response.headersSent) response.writeHead(502,{'Content-Type':'application/json'});
        response.end(JSON.stringify({error:{message:error.message}}));
      }
    });
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{server.unref();resolve(`http://127.0.0.1:${server.address().port}/v1`);});
  });
  return ready;
}
module.exports={ensureGateway};
