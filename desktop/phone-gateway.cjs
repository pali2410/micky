const http = require('node:http');
const os = require('node:os');
function createPhoneGateway({ targetPort = 8799, port = 8812, host = '0.0.0.0' } = {}) {
  let server;
  const status = () => ({ enabled: !!server?.listening, port, addresses: Object.entries(os.networkInterfaces()).sort(([a],[b])=>Number(/Wi-Fi|Wireless/i.test(b))-Number(/Wi-Fi|Wireless/i.test(a))).flatMap(([,entries])=>entries ?? []).filter(n => n && !n.internal && n.family === 'IPv4' && !n.address.startsWith('169.254.')).map(n => `http://${n.address}:${port}`) });
  async function enable(on) {
    if (!on) { if (server) await new Promise(r => server.close(r)); server = undefined; return status(); }
    if (server?.listening) return status();
    const next = http.createServer((req, res) => {
      // Every forwarded request remains remote: it must pass upstream pairing/session auth.
      const headers = { ...req.headers };
      for (const key of Object.keys(headers)) if (key.startsWith('x-openmausbot-') || key.startsWith('x-forwarded-') || key === 'forwarded') delete headers[key];
      headers['x-forwarded-for'] = req.socket.remoteAddress;
      headers['x-forwarded-proto'] = 'http';
      headers['x-forwarded-host'] = req.headers.host;
      const outgoing = http.request({ host:'127.0.0.1',port:targetPort,path:req.url,method:req.method,headers }, upstream => {
        res.writeHead(upstream.statusCode,upstream.headers); upstream.pipe(res);
      });
      outgoing.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('The local Maus service is unavailable.'); });
      req.on('aborted',()=>outgoing.destroy()); res.on('close',()=>outgoing.destroy()); req.pipe(outgoing);
    });
    await new Promise((resolve,reject)=>{next.once('error',reject);next.listen(port,host,resolve);});server=next;return status();
  }
  return { status, enable };
}
module.exports = { createPhoneGateway };
