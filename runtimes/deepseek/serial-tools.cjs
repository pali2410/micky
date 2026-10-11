// Desktop actions must observe the previous result before choosing target IDs.
// Ollama may emit speculative parallel calls despite parallel_tool_calls:false.
// Keep the first call in this assistant turn; the next inference sees its result.
const {Transform}=require('node:stream');
function serialToolStream(){
 let pending='';let firstIndex;const decoder=new TextDecoder();
 function line(value){
  if(!value.startsWith('data: ')||value.slice(6).trim()==='[DONE]')return value;
  try{const packet=JSON.parse(value.slice(6));
   for(const choice of packet.choices||[]){if(choice.delta?.tool_calls){
    if(firstIndex===undefined && choice.delta.tool_calls.length)firstIndex=choice.delta.tool_calls[0].index??0;
    choice.delta.tool_calls=choice.delta.tool_calls.filter(call=>(call.index??0)===firstIndex).map(call=>({...call,index:0}));
   }}
   return 'data: '+JSON.stringify(packet);
  }catch{return value;}
 }
 return new Transform({transform(chunk,encoding,callback){pending+=decoder.decode(chunk,{stream:true});const lines=pending.split('\n');pending=lines.pop();for(const value of lines)this.push(line(value)+'\n');callback();},flush(callback){pending+=decoder.decode();if(pending)this.push(line(pending));callback();}});
}
module.exports={serialToolStream};
