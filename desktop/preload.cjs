const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mickyElectron", {
  showMain: () => ipcRenderer.invoke("show-main"),
  minimizeToOverlay: () => ipcRenderer.invoke("minimize-main"),
  restoreMain: () => ipcRenderer.invoke("show-main"),
  closeOverlay: () => ipcRenderer.invoke("close-overlay"),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  switchApp: (mode) => ipcRenderer.invoke("micky:switch-app", mode),
  openNativeApp: (mode) => ipcRenderer.invoke('micky:native-app-open', mode),
  nativeAppStatus: () => ipcRenderer.invoke('micky:native-app-status'),
  desktopStatus: () => ipcRenderer.invoke('micky:desktop-status'),
  stopDesktop: () => ipcRenderer.invoke('micky:desktop-stop'),
  transcribeVoice: (wav) => ipcRenderer.invoke('micky:voice-transcribe',wav),
  voiceWake: (on) => ipcRenderer.invoke('micky:voice-wake',on),
  onVoiceWake: (callback) => {const listener=()=>callback();ipcRenderer.on('micky:voice-wake',listener);return()=>ipcRenderer.removeListener('micky:voice-wake',listener);},
  onVoiceStop: (callback) => {const listener=()=>callback();ipcRenderer.on('micky:voice-stop',listener);return()=>ipcRenderer.removeListener('micky:voice-stop',listener);},
  phone: {
    status: () => ipcRenderer.invoke("micky:phone-status"),
    enable: (enabled) => ipcRenderer.invoke("micky:phone-enable", enabled),
  },
  moveOverlay: (delta) => ipcRenderer.invoke("move-overlay", delta),
  onGlobalCursor: (cb) => {
    ipcRenderer.on("global-cursor", (_event, pos) => cb(pos));
  },
});

if (location.origin === 'http://127.0.0.1:8799') {
  contextBridge.exposeInMainWorld('ogb', {
    platform: 'win32',
    getCapabilities: async () => ({
      host: { platform:'win32',label:'Windows',session:'unknown',packaged:false },
      windowChrome:'native',
      screenPreview:{available:false,interaction:'none',reasonCode:'desktop-app-required'},
      dictation:{available:false,engine:'none',onDevice:false,reasonCode:'unsupported-platform'},
      localComputer:{available:false,support:'unsupported',enabled:false,status:'unavailable',reasonCode:'desktop-app-required'},
    }),
    androidDevice: {
      status: () => ipcRenderer.invoke('micky:android-status'),
      frame: (serial) => ipcRenderer.invoke('micky:android-frame', serial),
      input: (serial, payload) => ipcRenderer.invoke('micky:android-input', serial, payload),
    },
  });
}

contextBridge.exposeInMainWorld("electron", {
  showMain: () => ipcRenderer.invoke("show-main"),
  minimizeToOverlay: () => ipcRenderer.invoke("show-main"),
  restoreMain: () => ipcRenderer.invoke("show-main"),
  closeOverlay: () => ipcRenderer.invoke("close-overlay"),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  moveOverlay: (delta) => ipcRenderer.invoke("move-overlay", delta),
  onGlobalCursor: (cb) => {
    ipcRenderer.on("global-cursor", (_event, pos) => cb(pos));
  },
});
