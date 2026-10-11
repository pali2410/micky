const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { createPhoneGateway } = require('./phone-gateway.cjs');
function register({ipcMain,getWindow,repo,mickyUrl,services}) {
  const mausUrl='http://127.0.0.1:8799';
  const trusted = event => {
    const win=getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== event.sender.mainFrame || ![new URL(mickyUrl).origin,mausUrl,'http://127.0.0.1:5173'].includes(new URL(event.senderFrame.url).origin)) throw Error('Only the local Micky app can use this control');
  };
  const gateway=createPhoneGateway();
  const adb=import(pathToFileURL(path.join(repo,'OpenMausBot/electron/android-device.mjs')).href).then(m=>m.createAndroidDeviceController({env:{...process.env,OMB_ADB_PATH: process.env.OMB_ADB_PATH || path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe')}}));
  ipcMain.handle('micky:switch-app',async(event,mode)=>{trusted(event);if(!['micky','maus','rakazo'].includes(mode))throw Error('Unknown app');if(mode==='rakazo'){await require('./rakazo-native.cjs').ensureRakazo(repo,services);const login=await require('./rakazo-session.cjs').rakazoSession(repo);await require('./rakazo-session.cjs').connectWindows(repo,login);for(const cookie of login.cookies){const index=cookie.indexOf('=');await getWindow().webContents.session.cookies.set({url:'http://127.0.0.1:5173',name:cookie.slice(0,index),value:cookie.slice(index+1),path:'/',httpOnly:true,sameSite:'lax'});}return getWindow().loadURL('http://127.0.0.1:5173');}await getWindow().loadURL(mode==='maus'?mausUrl:mickyUrl);});
  ipcMain.handle('micky:android-status',async(event)=>{trusted(event);return(await adb).status({fresh:true});});
  ipcMain.handle('micky:android-frame',async(event,serial)=>{trusted(event);return(await adb).frame(serial);});
  ipcMain.handle('micky:android-input',async(event,serial,payload)=>{trusted(event);return(await adb).input(serial,payload);});
  ipcMain.handle('micky:phone-status',event=>{trusted(event);return gateway.status();});
  ipcMain.handle('micky:phone-enable',async(event,on)=>{trusted(event);if(typeof on!=='boolean')throw Error('Expected enabled flag');return gateway.enable(on);});
  require('electron').app.on('before-quit',()=>{void gateway.enable(false);});
}
module.exports={register};

