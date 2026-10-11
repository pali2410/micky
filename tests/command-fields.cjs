const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const intent={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/task-intent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(intent);
for(const goal of [
 'open whatsapp and search from person contact name fomr rushil2 and in there send message to taht person testing',
 'stupind in what app serchn these contact = rushil2 and send message testing',
 'open whatsapp and serch for contact name rushil2 and send messsage testing']) {
 const result=intent.parseWhatsAppCommand(goal);assert.equal(result.recipient,'rushil2');assert.equal(result.text,'testing');assert.equal(result.send,true);
}
assert.ok(intent.parseWhatsAppCommand('In WhatsApp send messge to rushil two').question);
assert.equal(intent.parseWhatsAppCommand('Open WhatsApp and search for contact rushil2').read,true);
const quoted='Open WhatsApp and search for contact rushil2 and send message "opne and serch: messsage"';
assert.equal(intent.parseWhatsAppCommand(quoted).text,'opne and serch: messsage');
assert.ok(intent.isComputerRequest('Can you delete all images?'));
console.log('PASS: real failed WhatsApp command variants, selection-only, missing message clarification, protected literal text and deletion routing.');
