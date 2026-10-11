"""Windows/local provider adaptations for the original HeyJev engine (Micky).

Mac code paths remain available on Mac. No cloud keys are read by this provider.
"""
import os, json, time, re, threading, subprocess, ctypes, webbrowser
from pathlib import Path
from urllib.parse import urlparse
import requests

REPO = Path(os.environ.get('MICKY_REPO', Path(__file__).resolve().parent.parent))
DATA = REPO / '.data' / 'heyjev'
DATA.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('MICKY_LOCAL_LLM_URL', 'http://127.0.0.1:11434/v1').rstrip('/')
if urlparse(URL).hostname not in ('localhost','127.0.0.1','::1'):
    raise RuntimeError('A loopback model endpoint is required')
MODEL = os.environ.get('MICKY_LOCAL_MODEL', 'qwen2.5:3b')
SPEAK = True
_model = None
_model_lock = threading.Lock()

def chat(messages, schema=None, tokens=700):
    body = dict(model=MODEL, messages=messages, stream=False, temperature=0.1, max_tokens=tokens)
    if schema: body['response_format'] = {'type':'json_schema','json_schema':{'name':'jev_decision','strict':True,'schema':schema}}
    r = requests.post(URL+'/chat/completions', json=body, timeout=120)
    r.raise_for_status()
    text = r.json().get('choices',[{}])[0].get('message',{}).get('content','').strip()
    if not text: raise RuntimeError('Local model returned an empty answer')
    return text

def classify(text, questions):
    start = time.monotonic()
    properties = {}
    for key,q in questions.items():
        if q['type']=='noul': properties[key]={'type':'boolean','description':q['instructions']}
        else:
            choices = list(q['criteria'])
            properties[key]={'type':'string','enum':choices,'description':q['instructions']}
    schema={'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
    value=json.loads(chat([{'role':'system','content':'Classify the request for a Windows assistant. mac_command means Windows computer command. Use none for actions not requested. Never claim an action was performed. Output the required JSON only.'}, {'role':'user','content':text}],schema))
    answers={}
    for key,spec in properties.items():
        v=value.get(key)
        if (spec['type']=='boolean' and type(v) is not bool) or ('enum' in spec and v not in spec['enum']):
            raise RuntimeError('Invalid local decision for '+key)
        # The upstream numeric gate indicates a accepted structured answer here,
        # not a measured confidence/probability of the local model.
        answers[key]=(v,1.0)
    return answers, int((time.monotonic()-start)*1000), 0

def ask(text):
    start=time.monotonic()
    return chat([{'role':'system','content':'You are HeyJev, a local Windows assistant. Answer briefly. Do not claim desktop actions unless tools verified them.'},{'role':'user','content':text}],tokens=180),int((time.monotonic()-start)*1000),0

def speak(text):
    if not SPEAK: return 0
    start=time.monotonic()
    clean=re.sub(r'\[[^\]]*\]','',text)
    # Stdin is data; spoken text is never interpolated into PowerShell code.
    script='Add-Type -AssemblyName System.Speech; $voice=New-Object System.Speech.Synthesis.SpeechSynthesizer; $voice.Speak([Console]::In.ReadToEnd()); $voice.Dispose()'
    p=subprocess.run(['powershell','-NoProfile','-Command',script],input=clean,text=True,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
    if p.returncode: raise RuntimeError('Windows speech failed')
    return int((time.monotonic()-start)*1000)

def whisper():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel
            _model=WhisperModel('small.en',device='cpu',compute_type='int8',download_root=str(DATA/'models'))
    return _model

def transcribe(audio):
    with _model_lock:
        model=_model
    if model is None: model=whisper()
    segs,_=model.transcribe(audio,language='en',beam_size=3,vad_filter=True)
    return ' '.join(s.text.strip() for s in segs).strip()

def chime():
    import winsound
    winsound.MessageBeep(winsound.MB_OK)

def choose_mic():
    import sounddevice as sd
    devices=sd.query_devices()
    candidates=[(i,d) for i,d in enumerate(devices) if d['max_input_channels']>0 and not re.search('stereo mix|mapper|primary sound',d['name'],re.I)]
    bluetooth=[(i,d) for i,d in candidates if re.search('bluetooth|hands.free|headset|earbud|buds|airpods',d['name'],re.I)]
    for i,d in bluetooth:
        try: sd.check_input_settings(device=i,channels=1,samplerate=16000); return i
        except Exception: pass
    return ''  # Windows default laptop input if the headset isn't available.

def bridge(name,args):
    token=(REPO/'.data/bridge-token').read_text().strip()
    r=requests.post('http://localhost:3000/api/bridge',headers={'Authorization':'Bearer '+token},json={'name':name,'arguments':args},timeout=60)
    r.raise_for_status();data=r.json()
    if data.get('error'): raise RuntimeError(data['error'])
    result=data.get('result')
    if isinstance(result,dict) and result.get('error'): raise RuntimeError(result['error'])
    return result

def app_action(app,action):
    if action=='open':
        result=bridge('open',{'path':app})
        return result
    import ctypes.wintypes as wt
    import psutil
    handles=[];u=ctypes.windll.user32
    u.GetForegroundWindow.restype=wt.HWND
    expected=Path(app).stem.lower()
    @ctypes.WINFUNCTYPE(wt.BOOL,wt.HWND,wt.LPARAM)
    def visit(hwnd,_):
        if u.IsWindowVisible(hwnd):
            buf=ctypes.create_unicode_buffer(1024);u.GetWindowTextW(hwnd,buf,1024)
            pid=wt.DWORD();u.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
            try: process=Path(psutil.Process(pid.value).name()).stem.lower()
            except psutil.Error: process=''
            if process==expected or app.lower()==buf.value.lower(): handles.append(hwnd)
        return True
    u.EnumWindows(visit,0)
    if len(handles)!=1: raise RuntimeError('Choose an exact open window for '+app+'; found '+str(len(handles)))
    hwnd=handles[0]
    if action=='quit':
        u.PostMessageW(hwnd,0x10,0,0);time.sleep(.3)
        if u.IsWindow(hwnd): raise RuntimeError('The window is still open, possibly waiting for save confirmation')
    elif action in ('hide','minimise'):
        u.ShowWindow(hwnd,6)
        if not u.IsIconic(hwnd):raise RuntimeError('The window did not minimise')
    elif action=='focus':
        u.ShowWindow(hwnd,9);u.SetForegroundWindow(hwnd)
        if u.GetForegroundWindow()!=hwnd: raise RuntimeError('Windows did not focus the requested window')

def volume(action,level=None,spotify=False):
    import comtypes
    from pycaw.pycaw import AudioUtilities
    comtypes.CoInitialize()
    try:
        if spotify:
            controls=[s.SimpleAudioVolume for s in AudioUtilities.GetAllSessions() if s.Process and s.Process.name().lower()=='spotify.exe']
            if not controls: raise RuntimeError('Spotify has no active audio session')
        else: controls=[AudioUtilities.GetSpeakers().EndpointVolume]
        for c in controls:
            current=c.GetMasterVolume() if spotify else c.GetMasterVolumeLevelScalar()
            if action in ('mute','unmute'): c.SetMute(action=='mute',None)
            else:
                target={'silent':0,'quiet':.25,'medium':.5,'loud':.75,'max':1}.get(level,.5) if action=='set' else min(1,max(0,current+(.2 if action=='up' else -.2)))
                if spotify: c.SetMasterVolume(target,None)
                else: c.SetMasterVolumeLevelScalar(target,None)
                actual=c.GetMasterVolume() if spotify else c.GetMasterVolumeLevelScalar()
                if abs(actual-target)>.02: raise RuntimeError('Volume did not change to the requested level')
    finally: comtypes.CoUninitialize()

def dark(action):
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER,r'Software\Microsoft\Windows\CurrentVersion\Themes\Personalize') as key:
        try: current=winreg.QueryValueEx(key,'AppsUseLightTheme')[0]
        except FileNotFoundError: current=1
        value=1-current if action=='toggle' else int(action=='dark_off')
        for name in ('AppsUseLightTheme','SystemUsesLightTheme'): winreg.SetValueEx(key,name,0,winreg.REG_DWORD,value)
    ctypes.windll.user32.SendNotifyMessageW(0xffff,0x1a,0,'ImmersiveColorSet')

def media(action):
    # Windows media APIs distinguish play/pause, rather than blindly toggling.
    import asyncio
    from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as Manager
    async def run():
        session=(await Manager.request_async()).get_current_session()
        if session is None: raise RuntimeError('No active media session')
        method={'play':'try_play_async','pause':'try_pause_async','next':'try_skip_next_async','previous':'try_skip_previous_async'}[action]
        if not await getattr(session,method)(): raise RuntimeError('Media player rejected '+action)
    asyncio.run(run())

def system(action):
    if action=='lock':
        if not ctypes.windll.user32.LockWorkStation(): raise RuntimeError('Windows lock request failed')
    else:
        if not ctypes.windll.powrprof.SetSuspendState(False,False,False): raise RuntimeError('Windows sleep request failed')

def browser(action,key,text,siri):
    if action=='browser_new_tab':
        bridge('chrome',{'url':'about:blank'})
        return 'browser_new_tab',{}
    url=siri.find_url(text)
    if not url: return 'browser_no_site',{}
    if urlparse(url).scheme not in ('http','https'): raise RuntimeError('Unsupported browser URL')
    bridge('chrome',{'url':url})
    return 'browser_open_site',{'site':urlparse(url).hostname}

def find_url(text):
    t=re.sub(r'\s+dot\s+','.',text,flags=re.I)
    m=re.search(r'\b((?:[\w-]+\.)+(?:com|co\.uk|org|net|io|ai|dev|tv|app|me|uk|gov|edu)(?:/\S*)?)',t,re.I)
    if m: return 'https://'+m[1].rstrip('.,!?')
    result=chat([{'role':'system','content':'Return only the https URL of the website requested or NONE.'},{'role':'user','content':text}],tokens=50)
    return result if urlparse(result).scheme=='https' else None

def copy_text(text):
    subprocess.run(['powershell','-NoProfile','-Command','Set-Clipboard -Value ([Console]::In.ReadToEnd())'],input=text,text=True,check=True,creationflags=subprocess.CREATE_NO_WINDOW)

def paste(text):
    from pynput.keyboard import Controller,Key
    copy_text(text)
    keyboard=Controller()
    with keyboard.pressed(Key.ctrl): keyboard.press('v');keyboard.release('v')

def install(siri):
    siri.jev=lambda text,questions=None:classify(text,questions or siri.QUESTIONS)
    siri.ask_llm=ask;siri.LLM_MODEL=MODEL;siri.speak=speak;siri.warm_cache=lambda:None
    siri.find_url=find_url;siri.run_browser=lambda action,key,text:browser(action,key,text,siri)
    def prepare_reminder(timer,said):
        try:
            schema={'type':'object','properties':{'label':{'type':'string'},'alert':{'type':'string'}},'required':['label','alert'],'additionalProperties':False}
            data=json.loads(chat([{'role':'system','content':'Create a short label and spoken alert for this reminder. Return label and alert JSON.'},{'role':'user','content':said}],schema,tokens=120))
            if not isinstance(data['label'],str) or not isinstance(data['alert'],str):raise ValueError('Invalid reminder')
            timer['label']=data['label'];timer['line']=data['alert']
        except Exception as exc:print('Local reminder preparation failed; original reminder retained:',exc)
    siri.prepare_reminder=prepare_reminder
    for action in ('open','quit','hide','minimise','focus'):
        siri.ACTIONS['app_'+action]=lambda arg,a=action:app_action(siri.APPS[arg],a)
    for prefix in ('','spotify_'):
        for action in ('up','down','mute','unmute','set'):
            siri.ACTIONS[prefix+'volume_'+action]=lambda arg,a=action,p=prefix:volume(a,arg,bool(p))
    for action in ('dark_on','dark_off','toggle'): siri.ACTIONS['display_'+action]=lambda _,a=action:dark(a)
    for action in ('play','pause','next','previous'): siri.ACTIONS['media_'+action]=lambda _,a=action:media(a)
    for action in ('lock','sleep'): siri.ACTIONS['system_'+action]=lambda _,a=action:system(a)
