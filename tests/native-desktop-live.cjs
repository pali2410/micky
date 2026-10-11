// Operates only an isolated, owned Windows Forms fixture. Never targets a user application.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'micky-semantic-'));
const script=path.join(fixture,'fixture.ps1'),receipt=path.join(fixture,'result.json');
fs.writeFileSync(script,`Add-Type -AssemblyName System.Windows.Forms
$form=New-Object System.Windows.Forms.Form
$form.Text='Micky Semantic Fixture'; $form.ShowInTaskbar=$true; $form.Width=450; $form.Height=220
$box=New-Object System.Windows.Forms.TextBox; $box.Name='Fixture input'; $box.AccessibleName='Fixture input'; $box.SetBounds(20,20,350,30)
$button=New-Object System.Windows.Forms.Button; $button.Text='Fixture verify'; $button.SetBounds(20,65,150,35)
$label=New-Object System.Windows.Forms.Label; $label.Text='Awaiting fixture'; $label.SetBounds(20,115,350,35)
$button.Add_Click({$label.Text='Fixture clicked: '+$box.Text; @{text=$box.Text;clicked=$true}|ConvertTo-Json|Set-Content -LiteralPath '${receipt.replaceAll("'","''")}'})
$form.Controls.AddRange(@($box,$button,$label))
$form.Add_Shown({$form.Show();$form.Activate();@{handle=$form.Handle.ToInt64()}|ConvertTo-Json|Set-Content -LiteralPath '${path.join(fixture,'window.json').replaceAll("'","''")}'})
[System.Windows.Forms.Application]::Run($form)
`);
const child=spawn('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:'ignore'});
const token=fs.readFileSync(path.join(__dirname,'../.data/bridge-token'),'utf8').trim();
const call=async(name,args)=>{const response=await fetch('http://127.0.0.1:8769/'+name,{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});const value=await response.json();if(!response.ok&&name==='inspect'){console.log('Fixture diagnostic before read',JSON.stringify({handle:args.handle,fixturePid:child.pid,exit:child.exitCode}));const {InputHelper}=require('../Bigfoot/src/main/input.js');const helper=new InputHelper();try{console.log('Fixture diagnostic',JSON.stringify({handle:args.handle,fixturePid:child.pid,title:await helper.windowTitle(),tree:JSON.parse(Buffer.from(await helper.send('uitree-window',0,0,0,10000,10000,500,args.handle),'base64').toString('utf8')).window}));}finally{helper.stop();}}assert.equal(response.ok,true,JSON.stringify(value));return value;};
(async()=>{try{for(let i=0;i<60&&!fs.existsSync(path.join(fixture,'window.json'));i++)await new Promise(r=>setTimeout(r,200));const handle=JSON.parse(fs.readFileSync(path.join(fixture,'window.json'),'utf8')).handle;
const start=Date.now();let view=await call('inspect',{handle});assert.equal(view.title,'Micky Semantic Fixture');const box=view.controls.find(c=>c.name==='Fixture input');assert.ok(box,JSON.stringify(view));const typed=await call('control',{handle,snapshot:view.snapshot,control:box.id,action:'type',text:'Isolated semantic test'});assert.equal(typed.verified,true);assert.equal(typed.value,'Isolated semantic test');
const stale=await fetch('http://127.0.0.1:8769/control',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({handle,snapshot:view.snapshot,control:box.id,action:'type',text:'Must not run'})});assert.equal(stale.status,400);
view=await call('inspect',{handle});const button=view.controls.find(c=>c.name==='Fixture verify');assert.ok(button);await call('control',{handle,snapshot:view.snapshot,control:button.id,action:'click'});for(let i=0;i<30&&!fs.existsSync(receipt);i++)await new Promise(r=>setTimeout(r,100));assert.equal(JSON.parse(fs.readFileSync(receipt,'utf8')).text,'Isolated semantic test');assert.equal((await fetch('http://127.0.0.1:8769/status')).status,401);console.log('PASS: native Windows UIA reads fixture, writes and verifies exact text, rejects stale replay, invokes real button; '+(Date.now()-start)+' ms total.');
}finally{child.kill();await new Promise(r=>setTimeout(r,500));assert.ok(path.resolve(fixture).startsWith(path.resolve(os.tmpdir())+path.sep+'micky-semantic-'));fs.rmSync(fixture,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
