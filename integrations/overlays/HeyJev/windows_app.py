"""Native Windows UI for the original HeyJev engine, adapted for local models.

Replaces Cocoa widgets with Tk; uses siri.py's command decisions, timers,
Recorder, wake/PTT loop and Dictation rather than forwarding voice to a web page.
"""
import os,json,queue,threading,time,tkinter as tk
from tkinter import ttk,messagebox
from pathlib import Path
import windows_backend as backend
import siri,dictation

def run_app():
    root=tk.Tk();root.title('HeyJev · Windows local');root.geometry('960x680');root.minsize(780,560)
    events=queue.Queue();controls=queue.Queue();worker=[None];busy=threading.Lock()
    settings_file=backend.DATA/'settings.json'
    try: settings=json.loads(settings_file.read_text())
    except Exception: settings={}
    if settings.get('model'): backend.MODEL=settings['model']
    backend.SPEAK=settings.get('speak',True)
    style=ttk.Style(root);style.theme_use('clam')
    style.configure('.',background='#18181b',foreground='#eeeeee',fieldbackground='#27272a',font=('Segoe UI',10))
    style.configure('TButton',padding=9);style.map('TButton',background=[('active','#3f3f46')])
    root.configure(bg='#18181b')
    nav=ttk.Frame(root,padding=16);nav.pack(side='left',fill='y')
    ttk.Label(nav,text='HeyJev',font=('Segoe UI',22,'bold')).pack(anchor='w',pady=(0,25))
    body=ttk.Frame(root,padding=22);body.pack(side='right',fill='both',expand=True)
    pages={};state=tk.StringVar(value='Ready · local models');detail=tk.StringVar(value='Type a command, or start the original voice engine.')
    listening=tk.BooleanVar(value=False);mode=tk.StringVar(value=settings.get('mode','continuous'));mic=tk.StringVar(value='Automatic · Bluetooth / laptop')
    def notify(s,d=''): events.put((s,d))
    def show(page):
        for p in pages.values(): p.pack_forget()
        pages[page].pack(fill='both',expand=True)
    def page(key,label):
        frame=ttk.Frame(body);pages[key]=frame
        ttk.Button(nav,text=label,command=lambda:show(key)).pack(fill='x',pady=4)
        ttk.Label(frame,text=label,font=('Segoe UI',19,'bold')).pack(anchor='w',pady=(0,18));return frame
    home=page('home','Home')
    ttk.Label(home,textvariable=state,font=('Segoe UI',13,'bold')).pack(anchor='w')
    ttk.Label(home,textvariable=detail,wraplength=650).pack(anchor='w',pady=10)
    text=tk.Text(home,height=14,bg='#222225',fg='white',insertbackground='white',wrap='word',state='disabled');text.pack(fill='both',expand=True,pady=8)
    def append(line):
        text.configure(state='normal');text.insert('end',line+'\n\n');text.see('end');text.configure(state='disabled')
    entry=ttk.Entry(home);entry.pack(fill='x',pady=8)
    def turn():
        command=entry.get().strip()
        if not command:return
        if not busy.acquire(blocking=False):messagebox.showinfo('HeyJev','The current command is still running.');return
        entry.delete(0,'end');append('You: '+command)
        def run():
            try:siri.handle(command,notify=notify)
            except Exception as exc:notify('Error',str(exc))
            finally:busy.release()
        threading.Thread(target=run,daemon=True).start()
    entry.bind('<Return>',lambda _:turn());ttk.Button(home,text='Send command',command=turn).pack(anchor='e')
    def start_voice():
        if worker[0] and worker[0].is_alive(): controls.put(('mode',mode.get()));listening.set(mode.get() in ('wake','continuous'));return
        controls.queue.clear()
        chosen=mics.get(mic.get(),'')
        def run():
            try:siri.run_voice_assistant(notify=notify,controls=controls,mode=mode.get(),mic=chosen)
            except Exception as exc:notify('Voice stopped',str(exc));events.put(('voice-off',''))
        worker[0]=threading.Thread(target=run,daemon=True);worker[0].start();listening.set(True)
    def stop_voice():controls.put('quit');listening.set(False)
    bar=ttk.Frame(home);bar.pack(fill='x',pady=12)
    ttk.Button(bar,text='Start listening',command=start_voice).pack(side='left')
    ttk.Button(bar,text='Stop listening',command=stop_voice).pack(side='left',padx=8)
    talk=ttk.Button(bar,text='Hold to talk (PTT)');talk.pack(side='left');talk.bind('<ButtonPress-1>',lambda _:controls.put('press'));talk.bind('<ButtonRelease-1>',lambda _:controls.put('release'))
    timers=tk.StringVar(value='No active timers');ttk.Label(home,textvariable=timers).pack(anchor='w')
    def editor(key,label,path,validate=None):
        frame=page(key,label)
        ttk.Label(frame,text='Edit and save JSON. Changes stay on this computer.').pack(anchor='w')
        area=tk.Text(frame,bg='#222225',fg='white',insertbackground='white',wrap='word');area.pack(fill='both',expand=True,pady=12)
        area.insert('end',path.read_text(encoding='utf-8') if path.exists() else '{}')
        def save():
            try:
                value=json.loads(area.get('1.0','end'))
                if validate:validate(value)
                path.write_text(json.dumps(value,indent=2,ensure_ascii=False),encoding='utf-8')
                if key=='dict':dictation.load_vocab()
                if key=='apps':messagebox.showinfo(label,'Saved. Restart HeyJev to reload app aliases.')
                else:messagebox.showinfo(label,'Saved.')
            except Exception as exc:messagebox.showerror(label,str(exc))
        ttk.Button(frame,text='Save',command=save).pack(anchor='e')
    def vocab_valid(value):
        if not isinstance(value,dict) or any(not isinstance(k,str) or not isinstance(v,list) or any(not isinstance(a,str) for a in v) for k,v in value.items()):raise ValueError('Use {"Word": ["heard variant"]}.')
    editor('dict','Dictionary',Path(dictation.USER_VOCAB),vocab_valid)
    editor('apps','Apps',Path(__file__).parent/'apps.windows.json',lambda v:None if isinstance(v,dict) and all(isinstance(a,str) or isinstance(a,dict) and isinstance(a.get('app'),str) for a in v.values()) else (_ for _ in ()).throw(ValueError('Use app aliases as JSON.')))
    history=page('hist','Dictation history');hist=tk.Text(history,bg='#222225',fg='white',wrap='word');hist.pack(fill='both',expand=True)
    def refresh_history():
        hist.delete('1.0','end')
        path=Path(dictation.HISTORY)
        if path.exists():
            for line in path.read_text(encoding='utf-8').splitlines()[-150:]:
                try:value=json.loads(line);hist.insert('end',value['time']+'\n'+value['text']+'\n\n')
                except Exception:pass
    ttk.Button(history,text='Refresh history',command=refresh_history).pack(anchor='e',pady=10);refresh_history()
    privacy=page('priv','Privacy')
    ttk.Label(privacy,text='Speech recognition, dictation, vocabulary, timers and replies run locally.\n\nCommand text uses your loopback LLM service. Desktop and browser commands use Micky’s authenticated local bridge. No cloud AI keys are required.\n\nIgnored wake phrases are discarded. Dictation history is stored under .data/heyjev. The initial Whisper model download requires internet; recognition then works locally.\n\nSay “Hey Jev, transcribe” to start dictation and “stop transcribing” to paste it in the focused application.',wraplength=650,justify='left').pack(anchor='w')
    preferences=page('settings','Settings')
    ttk.Label(preferences,text='Listening mode').pack(anchor='w');ttk.Combobox(preferences,textvariable=mode,values=['continuous','wake','ptt'],state='readonly').pack(fill='x',pady=10)
    ttk.Label(preferences,text='Microphone').pack(anchor='w')
    import sounddevice as sd
    mics={'Automatic · Bluetooth / laptop':''}
    for i,d in enumerate(sd.query_devices()):
        if d['max_input_channels']>0:mics[f"{i}: {d['name']}"]=i
    mic_picker=ttk.Combobox(preferences,textvariable=mic,values=list(mics),state='readonly');mic_picker.pack(fill='x',pady=10)
    mic_picker.bind('<<ComboboxSelected>>',lambda _:controls.put(('mic',mics[mic.get()] if mics[mic.get()]!='' else backend.choose_mic())))
    speak=tk.BooleanVar(value=backend.SPEAK);ttk.Checkbutton(preferences,text='Speak replies with Windows voice',variable=speak,command=lambda:setattr(backend,'SPEAK',speak.get())).pack(anchor='w',pady=10)
    model_page=page('models','Local models');model_var=tk.StringVar(value=backend.MODEL)
    try:models=requests_models()
    except Exception:models=[backend.MODEL]
    ttk.Label(model_page,text='Uses the same installed model service as Micky. Choose a text/instruction model here.').pack(anchor='w')
    ttk.Combobox(model_page,textvariable=model_var,values=models,state='readonly').pack(fill='x',pady=15)
    def save_settings():
        backend.MODEL=model_var.get();siri.LLM_MODEL=backend.MODEL
        settings_file.write_text(json.dumps({'model':backend.MODEL,'mode':mode.get(),'speak':speak.get()}),encoding='utf-8')
        if worker[0] and worker[0].is_alive():controls.put(('mode',mode.get()))
        messagebox.showinfo('HeyJev','Saved local settings.')
    ttk.Button(model_page,text='Use model and save settings',command=save_settings).pack(anchor='e')
    ttk.Button(preferences,text='Save settings',command=save_settings).pack(anchor='e',pady=15)
    def return_micky():
        import webbrowser
        # Signal the owning desktop process instead of starting another browser.
        try:
            token=(backend.REPO/'.data/bridge-token').read_text().strip()
            import requests
            requests.post('http://127.0.0.1:8769/micky/show',headers={'Authorization':'Bearer '+token},timeout=5).raise_for_status()
        except Exception as exc:messagebox.showerror('Micky',str(exc))
    ttk.Button(nav,text='Return to Micky',command=return_micky).pack(side='bottom',fill='x',pady=10)
    status_path=backend.DATA/'app-status.json';request_path=backend.DATA/'show.request';last_show=[None]
    quit_path=backend.DATA/'quit.request';launched_at=time.time()
    def poll():
        if quit_path.exists() and quit_path.stat().st_mtime>=launched_at:
            close();return
        while not events.empty():
            s,d=events.get()
            if s=='voice-off':listening.set(False);continue
            state.set(s);detail.set(d)
            if s=='Thinking':append('Heard: '+d)
            if s in ('Speaking','Error','Voice stopped'):append('HeyJev: '+d)
        snapshot=siri.timer_snapshot()
        timers.set('\n'.join(str(t) for t in snapshot) if snapshot else 'No active timers')
        status_path.write_text(json.dumps({'pid':os.getpid(),'ready':True,'model':backend.MODEL,'listening':listening.get(),'time':time.time(),'state':state.get()}),encoding='utf-8')
        if request_path.exists():
            stamp=request_path.stat().st_mtime_ns
            if stamp!=last_show[0]:root.deiconify();root.lift();root.focus_force();last_show[0]=stamp
        root.after(700,poll)
    def close():controls.put('quit');status_path.unlink(missing_ok=True);root.destroy()
    root.protocol('WM_DELETE_WINDOW',close)
    # Typed timers work even before voice is started. The engine starts its own
    # timer loop when listening begins; avoid installing a second loop here.
    siri.start_timer_loop(lambda t:(backend.chime(),notify("Time's up",siri.timer_done_line(t)),backend.speak(siri.timer_done_line(t))))
    show('home');poll();root.mainloop()

def requests_models():
    import requests
    r=requests.get(backend.URL+'/models',timeout=3);r.raise_for_status();return [m['id'] for m in r.json()['data']]

if __name__=='__main__':run_app()
