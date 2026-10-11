import { launchVerificationServer } from './control-omb.ts';
import { createRequire } from 'node:module';
import net from 'node:net';
const require=createRequire(import.meta.url);
const {createPhoneGateway}=require('../../desktop/phone-gateway.cjs');
const fixture=await launchVerificationServer();
const reserve=net.createServer();await new Promise<void>(r=>reserve.listen(0,'127.0.0.1',r));
const port=(reserve.address() as net.AddressInfo).port;await new Promise<void>(r=>reserve.close(()=>r()));
const gateway=createPhoneGateway({targetPort:Number(new URL(fixture.info.url).port),port,host:'127.0.0.1'});
const remote=`http://127.0.0.1:${port}`;
try {
  await gateway.enable(true);
  const unpaired=await fetch(remote+'/api/bots');if(![401,403].includes(unpaired.status))throw Error('Unpaired phone response: '+unpaired.status+' '+await unpaired.text());
  // Even spoofed loopback host and headers must retain remote authentication.
  if((await fetch(remote+'/api/bots',{headers:{'x-openmausbot-companion-auth':'spoof','x-forwarded-for':'127.0.0.1'}})).status<400)throw Error('Forwarded header bypass');
  const offer=await (await fetch(fixture.info.url+'/api/auth/pairing',{method:'POST',headers:{origin:fixture.info.url,'content-type':'application/json'},body:JSON.stringify({scopes:['client'],label:'Fixture phone'})})).json() as any;
  const pair=await fetch(remote+'/api/auth/pair',{method:'POST',headers:{origin:remote,'content-type':'application/json'},body:JSON.stringify({code:offer.code,label:'Fixture phone'})});
  if(!pair.ok)throw Error('Pairing failed: '+await pair.text());
  const session=await pair.json() as any;
  if((await fetch(remote+'/api/bots',{headers:{authorization:'Bearer '+session.token}})).status!==200)throw Error('Paired phone could not read chats');
  if((await fetch(remote+'/api/config',{method:'PATCH',headers:{authorization:'Bearer '+session.token,'content-type':'application/json'},body:'{}'})).status!==403)throw Error('Client pairing granted admin access');
  if((await fetch(remote+'/api/auth/pair',{method:'POST',headers:{origin:remote,'content-type':'application/json'},body:JSON.stringify({code:offer.code})})).status!==401)throw Error('Pairing code reused');
  const browserOffer=await(await fetch(fixture.info.url+'/api/auth/pairing',{method:'POST',headers:{origin:fixture.info.url,'content-type':'application/json'},body:JSON.stringify({scopes:['client']})})).json() as any;
  const browserPair=await fetch(remote+'/api/auth/pair',{method:'POST',headers:{origin:remote,'content-type':'application/json'},body:JSON.stringify({code:browserOffer.code,cookie:true})});
  if(!browserPair.ok)throw Error('Browser phone pairing failed');
  const cookie=browserPair.headers.get('set-cookie')?.split(';')[0];
  if(!cookie||(await fetch(remote+'/api/bots',{headers:{cookie,origin:remote}})).status!==200)throw Error('Paired phone browser could not read chats');
  console.log('PASS: isolated phone gateway denies unpaired access and spoofed headers, accepts single-use pairing and preserves client permissions.');
} finally {await gateway.enable(false);await fixture.close();}
