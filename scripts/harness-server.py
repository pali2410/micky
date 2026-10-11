#!/usr/bin/env python3
"""
Full Windows Computer Control Harness for Micky.
Provides real desktop execution for all tasks:
- PowerShell shell commands
- Application & Browser launching with specific Chrome profiles
- Screen capture, mouse clicks, keyboard hotkeys, and instant clipboard typing
"""
import os, sys, subprocess, base64, io, json, time, threading, uuid, re
from urllib.parse import quote, unquote
import win32gui, win32con, win32process, win32clipboard, psutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import ImageGrab
import pyautogui
from pywinauto import Desktop
from contextvars import ContextVar

# Respect the same local configuration when launched directly by Electron.
from pathlib import Path
_config = Path(__file__).resolve().parent.parent / ".env.local"
if _config.exists():
    for _line in _config.read_text(encoding="utf-8-sig").splitlines():
        if _line.strip() and not _line.lstrip().startswith("#") and "=" in _line:
            _key, _value = _line.split("=", 1)
            if _key.strip().startswith(("BOPS_", "MICKY_")):
                os.environ.setdefault(_key.strip(), _value.strip().strip('"'))

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

app = FastAPI(title="Micky Computer Harness")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3210", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"]
)

pyautogui.PAUSE = 0.05
pyautogui.FAILSAFE = True
_desktop_lock = threading.RLock()
_snapshots = {}
_browser_targets = {}
_requests = {}
_profile_evidence = {}
_job_id = ContextVar("micky_job_id", default="")
_cancelled = set()

def check_cancelled():
    if _job_id.get() in _cancelled: raise HTTPException(409, "Task cancelled")

@app.middleware("http")
async def task_context(request, call_next):
    token = _job_id.set(request.headers.get("X-Micky-Task", ""))
    try: return await call_next(request)
    finally: _job_id.reset(token)

@app.post("/cancel/{job_id}")
def cancel_job(job_id: str):
    _cancelled.add(job_id)
    return {"ok": True}

def browser_tabs(window):
    return [c for c in window.descendants(control_type="TabItem") if c.element_info.automation_id == "view_20"]

def tab_id(control):
    return ":".join(str(x) for x in control.element_info.runtime_id)

def address_key(url):
    return unquote(url.removeprefix("https://").removeprefix("http://").removeprefix("www.").rstrip("/"))

def profile_matches(window, profile_dir, email):
    cached = _profile_evidence.get(window.handle)
    if cached: return cached.lower() == (email or "").lower()
    try:
        cache = json.loads(Path(os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data\Local State")).read_text(encoding="utf-8"))["profile"]["info_cache"][profile_dir]
        labels = [cache.get("name", ""), cache.get("gaia_given_name", ""), cache.get("gaia_name", "")]
        buttons = [c for c in window.descendants(control_type="Button") if c.element_info.automation_id == "view_1018"]
        names = [c.window_text() for c in window.descendants(control_type="Pane")[:8]] + [c.window_text() for c in buttons]
        if not any(label and any(label in name for name in names) for label in labels): return False
        if not email: return True
        if not buttons: return False
        window.set_focus(); buttons[0].click_input()
        try:
            account = [c.window_text() for c in window.descendants(control_type="Window") if c.window_text().startswith("Accounts and sync,")]
            found = next((re.search(r"[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}", name).group(0) for name in account if re.search(r"[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}", name)), None)
            if found: _profile_evidence[window.handle] = found
            return bool(found and found.lower() == email.lower())
        finally: window.type_keys("{ESC}")
    except Exception: return False

def find_browser_target(profile_dir, email, target_url, inspect_tabs=False):
    hint = re.sub(r"^https?://(?:www\.)?", "", target_url).split("/")[0].split(".")[0].lower()
    for candidate in visible_windows("Chrome_WidgetWin_1"):
        try:
            w = Desktop(backend="uia").window(handle=candidate["handle"]).wrapper_object()
            if not profile_matches(w, profile_dir, email): continue
            def address(): return next(c for c in w.descendants(control_type="Edit") if c.element_info.automation_id == "view_1012").get_value()
            if address_key(address()) == address_key(target_url): return candidate
            if inspect_tabs:
                for tab in browser_tabs(w):
                    if hint not in tab.window_text().lower(): continue
                    w.set_focus(); tab.select()
                    if address_key(address()) == address_key(target_url): return candidate
        except Exception: pass
    return None

# ── Chrome Profile Resolver ───────────────────────────────────────────────────

def find_chrome_exe() -> str:
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return "chrome.exe"

def resolve_chrome_profile(email_or_query: str) -> tuple[str, str]:
    """
    Returns (profile_dir, profile_name) e.g. ('Profile 4', 'you@example.com')
    """
    local_state_path = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data\Local State")
    if not os.path.exists(local_state_path):
        raise HTTPException(404, "Chrome profile metadata is unavailable")
    try:
        with open(local_state_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cache = data.get("profile", {}).get("info_cache", {})
        query = email_or_query.lower().strip()
        for p_dir, info in cache.items():
            uname = str(info.get("user_name", "")).lower()
            name = str(info.get("name", "")).lower()
            if query and (query == uname or query == name or p_dir.lower() == query):
                return p_dir, info.get("user_name") or info.get("name") or p_dir
    except Exception:
        pass
    raise HTTPException(404, f"Chrome profile not found: {email_or_query}")

# ── Request Models ────────────────────────────────────────────────────────────

class ClickReq(BaseModel):
    x: float
    y: float
    button: str = "left"
    double: bool = False

class TypeReq(BaseModel):
    text: str
    interval: float = 0.02
    use_clipboard: bool = True

class KeyReq(BaseModel):
    key: str

class HotkeyReq(BaseModel):
    keys: list[str]

class ShellReq(BaseModel):
    cmd: str
    timeout: int = 45

class OpenReq(BaseModel):
    path: str
    url: str | None = None
    email: str | None = None
    profile: str | None = None

class ChromeReq(BaseModel):
    url: str | None = None
    email: str | None = None
    profile: str | None = None
    search: str | None = None
    request_id: str | None = None
    new_tab: bool = False

class InspectReq(BaseModel):
    handle: int
    tab: str | None = None

class ControlReq(BaseModel):
    snapshot: str
    control: str
    action: str = "click"
    text: str | None = None

class FilesReq(BaseModel):
    path: str | None = None
    screenshots: bool = False
    recursive: bool = False

class WhatsAppReq(BaseModel):
    email: str | None = None
    recipient: str
    text: str = ""
    read: bool = False
    send: bool = False
    request_id: str

class WebReq(BaseModel):
    url: str

class SpreadsheetReq(BaseModel):
    path: str
    headers: list[str]
    rows: list[list[str | int | float | None]]
    replace: bool = False

class ScreenReq(BaseModel):
    handle: int | None = None
    path: str | None = None

class InputReq(BaseModel):
    handle: int
    tab: str | None = None
    keys: list[str] = []
    scroll: int = 0

@app.post("/input")
def targeted_input(req: InputReq):
    with _desktop_lock:
        check_cancelled()
        if not win32gui.IsWindow(req.handle): raise HTTPException(404,"That window closed")
        window=Desktop(backend="uia").window(handle=req.handle).wrapper_object()
        window.set_focus()
        if req.tab:
            tabs=[c for c in browser_tabs(window) if tab_id(c)==req.tab]
            if len(tabs)!=1: raise HTTPException(409,"The selected tab changed")
            tabs[0].select()
        if req.keys:
            keys=[key.lower() for item in req.keys for key in item.split('+')]
            aliases={'control':'ctrl','return':'enter','escape':'esc','windows':'win','command':'win'}
            keys=[aliases.get(key,key) for key in keys]
            if any(key not in pyautogui.KEYBOARD_KEYS for key in keys): raise HTTPException(400,"Use standard keyboard key names")
            pyautogui.hotkey(*keys)
        if req.scroll: pyautogui.scroll(req.scroll)
        return {"ok":True,"handle":req.handle,"keys":req.keys,"scroll":req.scroll}

_desktop_state = {"revision":0,"windows":[],"foreground":None,"observedAt":0}
_state_lock=threading.Lock()
def watch_desktop():
    # Win32 window state is cheap and passive; screenshots aren't taken in this loop.
    import pythoncom
    pythoncom.CoInitialize()
    last_tree=0
    while True:
        try:
            windows=visible_windows(); foreground=win32gui.GetForegroundWindow()
            signature=json.dumps([windows,foreground],sort_keys=True)
            observation=None
            if time.monotonic()-last_tree>2 and win32gui.IsWindow(foreground):
                last_tree=time.monotonic()
                try: observation=inspect_window(InspectReq(handle=foreground))
                except Exception: pass
            with _state_lock:
                if signature!=_desktop_state.get("signature"):
                    _desktop_state.update(revision=_desktop_state["revision"]+1,windows=windows,foreground=foreground,signature=signature,observedAt=time.time())
                if observation:
                    _desktop_state.update(observation=observation,revision=_desktop_state['revision']+1,observedAt=time.time())
        except Exception: pass
        time.sleep(.3)

@app.get("/desktop")
def live_desktop():
    with _state_lock: state={k:v for k,v in _desktop_state.items() if k!='signature'}
    if not state['windows']: state.update(windows=visible_windows(),foreground=win32gui.GetForegroundWindow(),observedAt=time.time())
    return {"ok":True,**state}

@app.get("/desktop/stream")
async def desktop_stream():
    from fastapi.responses import StreamingResponse
    import asyncio
    async def events():
        previous=-1
        while True:
            state=live_desktop()
            if state['revision']!=previous:
                previous=state['revision']; yield 'data: '+json.dumps(state)+'\n\n'
            else: yield ': heartbeat\n\n'
            await asyncio.sleep(.5)
    return StreamingResponse(events(),media_type='text/event-stream')

@app.get("/applications")
def applications():
    result=subprocess.run(['powershell','-NoProfile','-Command','Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'],capture_output=True,text=True,timeout=15)
    return {"ok":result.returncode==0,"applications":json.loads(result.stdout or '[]')}

class ScrollReq(BaseModel):
    x: int
    y: int
    amount: int

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "harness": "micky-full-windows-harness"}

@app.post("/screenshot")
def screenshot(req: ScreenReq = ScreenReq()):
    if req.path:
        from PIL import Image
        img = Image.open(req.path).convert("RGB")
    elif req.handle:
        if not win32gui.IsWindow(req.handle): raise HTTPException(404, "That window is closed")
        with _desktop_lock:
            w = Desktop(backend="uia").window(handle=req.handle).wrapper_object(); w.set_focus()
            img = ImageGrab.grab(bbox=win32gui.GetWindowRect(req.handle))
    else:
        img = ImageGrab.grab()
    img.thumbnail((1280, 960))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return {
        "image": base64.b64encode(buf.getvalue()).decode(),
        "width": img.width,
        "height": img.height
    }

@app.post("/click")
def click(req: ClickReq):
    x, y = int(req.x), int(req.y)
    if req.double:
        pyautogui.doubleClick(x, y, button=req.button)
    else:
        pyautogui.click(x, y, button=req.button)
    return {"ok": True, "x": x, "y": y}

@app.post("/type")
def type_text(req: TypeReq):
    if req.use_clipboard:
        try:
            win32clipboard.OpenClipboard()
            try:
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardText(req.text, win32con.CF_UNICODETEXT)
            finally:
                win32clipboard.CloseClipboard()
            pyautogui.hotkey("ctrl", "v")
            return {"ok": True, "method": "clipboard"}
        except Exception:
            pass
    pyautogui.typewrite(req.text, interval=req.interval)
    return {"ok": True, "method": "typewrite"}

@app.post("/key")
def key_press(req: KeyReq):
    pyautogui.press(req.key)
    return {"ok": True, "key": req.key}

@app.post("/hotkey")
def hotkey_press(req: HotkeyReq):
    pyautogui.hotkey(*req.keys)
    return {"ok": True, "keys": req.keys}

@app.post("/scroll")
def scroll(req: ScrollReq):
    pyautogui.scroll(req.amount, x=req.x, y=req.y)
    return {"ok": True}

@app.post("/shell")
def shell_cmd(req: ShellReq):
    # Always execute with PowerShell for full Windows capability
    p = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", req.cmd],
        capture_output=True,
        text=True,
        timeout=req.timeout
    )
    return {
        "stdout": p.stdout,
        "stderr": p.stderr,
        "code": p.returncode
    }

@app.post("/chrome")
def open_chrome(req: ChromeReq):
    with _desktop_lock:
        return _open_chrome_locked(req)

def _open_chrome_locked(req):
    check_cancelled()
    if req.request_id and req.request_id in _requests:
        previous = _requests[req.request_id]
        if win32gui.IsWindow(previous["handle"]):
            return previous
    chrome_exe = find_chrome_exe()
    if not req.email and not req.profile: req.email = os.environ.get("BOPS_CHROME_PROFILE_EMAIL") or None
    profile_dir = req.profile
    if not profile_dir and req.email:
        profile_dir, _ = resolve_chrome_profile(req.email)
    if not profile_dir:
        profile_dir = "Default"

    target_url = req.url
    if req.search:
        target_url = f"https://www.google.com/search?q={quote(req.search)}"
    elif not target_url:
        target_url = "https://www.google.com"

    key = (profile_dir, target_url.rstrip("/"))
    previous = _browser_targets.get(key)
    if previous and not req.new_tab and win32gui.IsWindow(previous["handle"]):
        try:
            window = Desktop(backend="uia").window(handle=previous["handle"]).wrapper_object()
            tabs = [c for c in browser_tabs(window) if tab_id(c) == previous["tab"]]
            if len(tabs) == 1:
                window.set_focus(); tabs[0].select()
                address = next(c for c in window.descendants(control_type="Edit") if c.element_info.automation_id == "view_1012").get_value()
                if address_key(target_url) == address_key(address):
                    result = dict(previous, reused=True)
                    if req.request_id: _requests[req.request_id] = result
                    return result
        except Exception:
            pass
    matched = None if req.new_tab else find_browser_target(profile_dir, req.email, target_url, inspect_tabs=True)
    reused = matched is not None
    if not matched:
        args = [chrome_exe, f'--profile-directory={profile_dir}', "--force-renderer-accessibility", target_url]
        subprocess.Popen(args)
    windows = visible_windows("Chrome_WidgetWin_1") if matched else wait_window("Chrome_WidgetWin_1")
    if not windows: raise HTTPException(504, "Chrome launched but no visible window appeared")
    for _ in range(50):
        if not matched: matched = find_browser_target(profile_dir, req.email, target_url)
        if matched: break
        time.sleep(0.1)
    if not matched:
        raise HTTPException(504, "Chrome opened, but its address could not be verified")
    w = Desktop(backend="uia").window(handle=matched["handle"]).wrapper_object()
    w.set_focus()
    selected = [c for c in browser_tabs(w) if c.is_selected()]
    if len(selected) != 1: raise HTTPException(409, "Chrome's selected tab could not be identified")
    result = {
        "visible": True,
        "verified": True,
        "reused": reused,
        "handle": matched["handle"],
        "tab": tab_id(selected[0]),
        "tab_name": selected[0].window_text(),
        "windows": windows,
        "ok": True,
        "chrome": chrome_exe,
        "profile": profile_dir,
        "url": target_url
    }
    _browser_targets[key] = result
    if req.request_id: _requests[req.request_id] = result
    return result

@app.post("/inspect")
def inspect_window(req: InspectReq):
    with _desktop_lock:
        if not win32gui.IsWindow(req.handle): raise HTTPException(404, "That window is closed")
        w = Desktop(backend="uia").window(handle=req.handle).wrapper_object()
        if req.tab:
            tabs = [c for c in browser_tabs(w) if tab_id(c) == req.tab]
            if len(tabs) != 1: raise HTTPException(409, "The requested browser tab is missing or ambiguous")
            if not tabs[0].is_selected(): w.set_focus(); tabs[0].select()
        # Inspection is passive. Action endpoints activate this exact window themselves.
        # Newly opened pages may expose only browser chrome until their document is ready.
        for _ in range(30):
            docs = w.descendants(control_type="Document")
            if docs and docs[0].descendants(): break
            if not req.tab: break
            time.sleep(0.1)
        controls = []
        bindings = {}
        for c in w.descendants():
            name = c.window_text().strip()
            kind = c.element_info.control_type
            if kind in ("Group", "Pane", "Image", "Separator", "StatusBar", "ToolBar"): continue
            if not name and kind not in ("Edit", "Document"): continue
            if not c.is_visible(): continue
            key = str(len(controls))
            item = {"id": key, "name": name[:240], "type": kind, "automation_id": c.element_info.automation_id}
            try:
                rect=c.rectangle(); item['bounds']=[rect.left,rect.top,rect.right,rect.bottom]
            except Exception: pass
            if kind in ("Edit", "Document"):
                try: item["value"] = c.get_value()[:400]
                except Exception:
                    if kind == "Document":
                        try: item["value"] = c.iface_text.DocumentRange.GetText(400)
                        except Exception: pass
            if any(x["name"] == item["name"] and x["type"] == kind for x in controls): continue
            controls.append(item); bindings[key] = c
            if len(controls) >= 300: break
        token = str(uuid.uuid4())
        _snapshots[token] = (time.monotonic(), req.handle, bindings, req.tab)
        for old, entry in list(_snapshots.items()):
            if time.monotonic() - entry[0] > 120: del _snapshots[old]
        return {"ok": True, "snapshot": token, "handle": req.handle, "title": w.window_text(), "controls": controls}

@app.post("/control")
def control(req: ControlReq):
    with _desktop_lock:
        check_cancelled()
        entry = _snapshots.get(req.snapshot)
        if not entry or time.monotonic() - entry[0] > 90:
            raise HTTPException(409, "Inspect that window again; the observation expired")
        _, handle, bindings, tab = entry
        c = bindings.get(req.control)
        if c is None: raise HTTPException(400, "Choose an element from the actual observation")
        try:
            w = Desktop(backend="uia").window(handle=handle).wrapper_object()
            w.set_focus()
            if tab:
                tabs = [x for x in browser_tabs(w) if tab_id(x) == tab]
                if len(tabs) != 1: raise ValueError("The observed browser tab changed")
                tabs[0].select()
            if not c.is_visible() or not c.is_enabled(): raise ValueError("The element is unavailable")
            if req.action == "click":
                try: c.invoke()
                except Exception: c.click_input()
            elif req.action == "type":
                check_cancelled()
                if c.element_info.control_type not in ("Edit", "Document"): raise ValueError("Only an observed text field or document can receive text")
                c.click_input()
                c.set_focus()
                pyautogui.hotkey("ctrl", "a")
                type_text(TypeReq(text=req.text or ""))
                # Never press Enter implicitly: drafting and sending are different operations.
            elif req.action == "select": c.select()
            else: raise ValueError("Unsupported control action")
            result = {"ok": True, "handle": handle, "element": c.window_text(), "action": req.action}
            if req.action == "type":
                for _ in range(12):
                    try: result["value"] = c.get_value()
                    except Exception:
                        try: result["value"] = c.iface_text.DocumentRange.GetText(-1)
                        except Exception: pass
                    if result.get("value", "").rstrip("\r\n") == (req.text or ""): break
                    time.sleep(.1)
                if result.get("value", "").rstrip("\r\n") != (req.text or ""): raise ValueError("The text field did not confirm the requested draft")
            for old, observation in list(_snapshots.items()):
                if observation[1] == handle and observation[3] == tab: del _snapshots[old]
            return result
        except Exception as e:
            raise HTTPException(409, f"The observed control changed: {e}")

@app.post("/files")
def inspect_files(req: FilesReq):
    if req.screenshots and not req.path:
        roots = [Path(os.environ.get("OneDrive", ""))/"Pictures"/"Screenshots", Path.home()/"Pictures"/"Screenshots"]
        roots = list(dict.fromkeys(p.resolve() for p in roots if p.is_dir()))
        if not roots: raise HTTPException(404, "No Screenshots folder found; provide its location")
        if len(roots) > 1: return {"ok": True, "needs_path": [str(p) for p in roots]}
        folder = roots[0]
    else:
        pictures = Path.home()/"Pictures"
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as key:
                pictures = Path(os.path.expandvars(winreg.QueryValueEx(key, "My Pictures")[0]))
        except OSError: pass
        folder = Path(req.path or str(pictures)).expanduser().resolve()
    if not folder.is_dir(): raise HTTPException(404, "That folder does not exist")
    extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff"}
    skipped = []
    count = 0; examples = []
    for root, dirs, names in os.walk(folder, onerror=lambda e: skipped.append(str(e.filename)), followlinks=False):
        check_cancelled()
        dirs[:] = [d for d in dirs if not os.path.isjunction(os.path.join(root, d))]
        for name in names:
            if Path(name).suffix.lower() in extensions:
                count += 1
                if len(examples) < 500: examples.append(str(Path(root,name).relative_to(folder)))
        if not req.recursive: break
    return {"ok": True, "path": str(folder), "image_count": count, "files": examples, "recursive": req.recursive, "skipped_folders": skipped[:20]}

_image_plans = {}

class RecycleReq(BaseModel):
    plan: str
    request_id: str

@app.post("/images/plan")
def plan_images(req: FilesReq):
    result = inspect_files(req)
    if result.get('needs_path'): return result
    root = Path(result['path']).resolve()
    if root == Path(root.anchor): raise HTTPException(400, 'Choose a specific image folder, not an entire drive')
    records=[]
    extensions={'.png','.jpg','.jpeg','.webp','.bmp','.gif','.tiff'}
    for current, dirs, names in os.walk(root, followlinks=False):
        check_cancelled()
        dirs[:]=[d for d in dirs if not os.path.isjunction(os.path.join(current,d)) and not Path(current,d).is_symlink()]
        for name in names:
            file=Path(current,name)
            if file.suffix.lower() not in extensions or file.is_symlink(): continue
            resolved=file.resolve()
            if not resolved.is_relative_to(root): raise HTTPException(409,'An image path escaped the selected folder')
            stat=resolved.stat();records.append((str(resolved),stat.st_size,stat.st_mtime_ns))
        if not req.recursive: break
    token=uuid.uuid4().hex
    for old,entry in list(_image_plans.items()):
        if time.monotonic()-entry[0]>120: del _image_plans[old]
    _image_plans[token]=(time.monotonic(),str(root),records)
    return {'ok':True,'plan':token,'path':str(root),'image_count':len(records)}

def recycle_file(path):
    from win32com.shell import shell, shellcon
    code,aborted=shell.SHFileOperation((0,shellcon.FO_DELETE,path+'\0',None,shellcon.FOF_ALLOWUNDO|shellcon.FOF_NOCONFIRMATION|shellcon.FOF_NOERRORUI,None,None))
    return code==0 and not aborted and not Path(path).exists()

@app.post("/images/recycle")
def recycle_images(req: RecycleReq):
    check_cancelled()
    if req.request_id in _requests: return _requests[req.request_id]
    entry=_image_plans.pop(req.plan,None)
    if not entry or time.monotonic()-entry[0]>120: raise HTTPException(409,'The image plan expired; inspect the folder again')
    _,root,records=entry
    # Check every resolved path and version before the first mutation.
    for name,size,modified in records:
        path=Path(name)
        if path.is_symlink() or not path.resolve().is_relative_to(Path(root)): raise HTTPException(409,'An image path changed')
        stat=path.stat()
        if stat.st_size!=size or stat.st_mtime_ns!=modified: raise HTTPException(409,'An image changed after inspection; inspect again')
    recycled=0;failed=0
    receipt={'path':root,'request_id':req.request_id,'files':[]}
    for name,_,_ in records:
        check_cancelled()
        try: done=recycle_file(name)
        except Exception: done=False
        recycled+=int(done);failed+=int(not done);receipt['files'].append({'path':name,'recycled':done})
    receipts=Path(__file__).resolve().parents[1]/'.data'/'file-operations';receipts.mkdir(parents=True,exist_ok=True)
    receipts.joinpath(uuid.uuid4().hex+'.json').write_text(json.dumps(receipt),encoding='utf-8')
    result={'ok':True,'path':root,'recycled':recycled,'failed':failed,'verified':failed==0}
    _requests[req.request_id]=result
    return result

@app.post("/web")
def read_web(req: WebReq):
    import requests
    from bs4 import BeautifulSoup
    if not req.url.startswith(("https://", "http://")): raise HTTPException(400, "Provide a complete website URL")
    response = requests.get(req.url, timeout=15, headers={"User-Agent": "Mozilla/5.0 Micky research"})
    if not response.ok: raise HTTPException(502, f"Website returned HTTP {response.status_code}")
    if "html" not in response.headers.get("Content-Type", ""): raise HTTPException(400, "This resource is not a web page")
    page = BeautifulSoup(response.content[:2000000], "html.parser")
    title = page.title.get_text(" ", strip=True) if page.title else ""
    for item in page(["script", "style", "nav", "footer"]): item.decompose()
    return {"ok": True, "url": response.url, "title": title, "text": page.get_text(" ", strip=True)[:10000], "links": [{"name": a.get_text(" ",strip=True)[:100], "url": a.get("href")} for a in page.find_all("a",href=True)[:60]]}

@app.post("/spreadsheet")
def write_spreadsheet(req: SpreadsheetReq):
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    path = Path(req.path).expanduser().resolve()
    if path.suffix.lower() != ".xlsx": raise HTTPException(400, "Use an .xlsx file name")
    if path.exists() and not req.replace: raise HTTPException(409, "That spreadsheet exists. Choose a new file name or request replacement.")
    if not req.headers or any(len(row) != len(req.headers) for row in req.rows): raise HTTPException(400, "Every row must match the column count")
    if len(req.rows) > 10000: raise HTTPException(400, "This export is limited to 10,000 rows")
    book = Workbook(); sheet = book.active; sheet.title = "Research"
    sheet.append(req.headers)
    for row in req.rows:
        sheet.append(row)
        for cell in sheet[sheet.max_row]:
            if isinstance(cell.value, str): cell.data_type = "s"  # Website text is data, never executable formulas.
    for cell in sheet[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="26364A")
    sheet.freeze_panes = "A2"; sheet.auto_filter.ref = sheet.dimensions
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = min(65, max(16, max(len(str(c.value or "")) for c in column) + 2))
        for cell in column: cell.alignment = Alignment(vertical="top", wrap_text=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.stem+".micky-tmp.xlsx")
    book.save(temporary)
    check = load_workbook(temporary, read_only=True)
    if check.active.max_row != len(req.rows)+1: raise HTTPException(500, "Spreadsheet verification failed")
    check.close(); os.replace(temporary, path)
    return {"ok": True, "verified": True, "path": str(path), "rows": len(req.rows), "columns": len(req.headers)}

@app.post("/whatsapp")
def whatsapp(req: WhatsAppReq):
    # Each observed action restores its exact window and tab under a short lock.
    check_cancelled()
    if req.request_id in _requests: return _requests[req.request_id]
    opened = open_chrome(ChromeReq(email=req.email, url="https://web.whatsapp.com", request_id=req.request_id+":open"))
    query = InspectReq(handle=opened["handle"], tab=opened["tab"])
    observation = inspect_window(query)
    own = req.recipient.lower() in ("self", "myself", "me", "my own chat")
    contact_pattern = r"\s*".join(re.escape(c) for c in re.sub(r"\s+", "", req.recipient)) + r"(?:\s|$)"
    def matches(o):
        return [c for c in o["controls"] if c["type"] == "DataItem" and ("(You)" in c["name"] if own else re.match(contact_pattern, c["name"], re.I))]
    def searches(o):
        docs=[c for c in o['controls'] if c['type']=='Document' and c.get('bounds')]
        return [c for c in o['controls'] if c['type']=='Edit' and c.get('automation_id')!='view_1012' and
                ('Search or start a new chat' in c['name'] or (docs and c.get('bounds') and
                 c['bounds'][0] < docs[0]['bounds'][0]+(docs[0]['bounds'][2]-docs[0]['bounds'][0])*.5 and
                 c['bounds'][1] < docs[0]['bounds'][1]+150))]
    def compose_fields(o):
        search_ids={c['id'] for c in searches(o)}
        return [c for c in o['controls'] if c['type']=='Edit' and c.get('automation_id')!='view_1012' and c['id'] not in search_ids and 'Search' not in c['name']]
    for _ in range(35):
        if matches(observation) or searches(observation): break
        time.sleep(.2); observation = inspect_window(query)
    rows = matches(observation)
    if not rows:
        search = searches(observation)
        if not search: raise HTTPException(409, "WhatsApp is not ready or not signed in. Open it and sign in first.")
        name = req.recipient
        if own:
            cache = json.loads(Path(os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data\Local State")).read_text(encoding="utf-8"))["profile"]["info_cache"][opened["profile"]]
            name = cache.get("gaia_given_name") or cache.get("gaia_name", "").split(" ")[0]
            if not name: raise HTTPException(409, "Tell me the name shown on your self chat")
        control(ControlReq(snapshot=observation["snapshot"], control=search[0]["id"], action="type", text=name))
        for _ in range(20):
            time.sleep(.2); observation = inspect_window(query); rows = matches(observation)
            if rows: break
    if not rows: raise HTTPException(404, "The requested chat was not found")
    # Nested accessibility rows refer to the same chat. Require one distinct chat label.
    if not own:
        groups=[]
        for row in rows:
            same=None
            for group in groups:
                a=row.get('bounds');b=group[0].get('bounds')
                overlap=a and b and max(a[0],b[0])<min(a[2],b[2]) and max(a[1],b[1])<min(a[3],b[3])
                nested=not a and not b and (row['name'].startswith(group[0]['name']) or group[0]['name'].startswith(row['name']))
                if overlap or nested: same=group;break
            if same is None: groups.append([row])
            else: same.append(row)
        if len(groups)>1: raise HTTPException(409, "Multiple matching chats; provide the exact contact name or number")
    row = min(rows, key=lambda c: len(c["name"]))
    control(ControlReq(snapshot=observation["snapshot"], control=row["id"]))
    message = None
    for _ in range(20):
        time.sleep(.15); observation = inspect_window(query)
        confirmed_chat = any(c["type"] == "Button" and ("(You)" in c["name"] if own else re.match(contact_pattern, c["name"], re.I)) for c in observation["controls"])
        edits = compose_fields(observation)
        if not confirmed_chat: edits = []
        if len(edits) == 1: message = edits[0]; break
    if not message: raise HTTPException(409, "The message field is unavailable in the selected chat")
    if req.read:
        # Exclude the sidebar and document-wide TextPattern (which contains other chats).
        bounds=message.get('bounds')
        controls=[c for c in observation['controls'] if c['type']!='Document' and (not bounds or (c.get('bounds') and c['bounds'][0]>=bounds[0]-100))]
        return {"ok":True,"verified":True,"recipient":row["name"],"visibleControls":controls,"handle":opened["handle"],"scope":"Visible selected-chat accessibility content; not a complete history"}
    if not req.text: raise HTTPException(400,"Message text is required")
    previous_draft = message.get("value", "").rstrip("\r\n")
    if previous_draft.strip() and previous_draft != req.text:
        # An explicit new message supersedes the compose draft, but retain its text.
        drafts = Path(__file__).resolve().parents[1] / ".data" / "drafts"
        drafts.mkdir(parents=True, exist_ok=True)
        backup = drafts / ("whatsapp-" + uuid.uuid4().hex + ".json")
        backup.write_text(json.dumps({"recipient": row["name"], "text": previous_draft, "savedAt": time.time()}, ensure_ascii=False), encoding="utf-8")
    result = control(ControlReq(snapshot=observation["snapshot"], control=message["id"], action="type", text=req.text))
    if result.get("value", "").rstrip("\r\n") != req.text: raise HTTPException(409, "The requested draft was not verified")
    if req.send:
        observation = inspect_window(query)
        buttons = [c for c in observation["controls"] if c["type"] == "Button" and re.fullmatch(r"Send(?: \(Enter\))?", c["name"])]
        if len(buttons) != 1: raise HTTPException(409, "The send control was not unambiguous; the draft is still unsent")
        control(ControlReq(snapshot=observation["snapshot"], control=buttons[0]["id"]))
        # A cleared compose box is evidence of submission, not delivery/read status.
        for _ in range(20):
            time.sleep(.15); observation = inspect_window(query)
            fields = compose_fields(observation)
            # Missing accessibility text is unknown, not an empty composer.
            # Never report submission merely because the provider omitted value.
            if len(fields)==1 and "value" in fields[0] and isinstance(fields[0]["value"], str) and not fields[0]["value"].strip(): break
        else: raise HTTPException(409, "Submission could not be verified; do not retry automatically")
    answer = {"ok": True, "verified": True, "recipient": row["name"], "draft": req.text, "submitted": req.send, "handle": opened["handle"]}
    _requests[req.request_id] = answer
    return answer

def visible_windows(class_name=None):
    found = []
    def collect(hwnd, _):
        if win32gui.IsWindowVisible(hwnd) and (not class_name or win32gui.GetClassName(hwnd) == class_name):
            if class_name == "Chrome_WidgetWin_1":
                try:
                    _, pid = win32process.GetWindowThreadProcessId(hwnd)
                    if psutil.Process(pid).name().lower() != "chrome.exe": return
                except Exception: return
            title = win32gui.GetWindowText(hwnd)
            if title:
                found.append({"handle": hwnd, "title": title, "class": win32gui.GetClassName(hwnd)})
    win32gui.EnumWindows(collect, None)
    return found

def wait_window(class_name):
    for _ in range(40):
        windows = visible_windows(class_name)
        if windows:
            hwnd = windows[-1]["handle"]
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            try: win32gui.SetForegroundWindow(hwnd)
            except Exception: pass
            return windows
        time.sleep(0.1)
    return []

@app.get("/windows")
def windows():
    return {"windows": visible_windows()}

@app.post("/open")
def open_app(req: OpenReq):
    check_cancelled()
    target = (req.path or req.url or "").strip()
    if target.lower() in ('control panel','the control panel','full control panel'): target='control.exe'
    if not target:
        raise HTTPException(400, "An application, file path, or URL is required")
    if target.lower() in ("explorer", "explorer.exe", "file explorer", "file manager") or os.path.isdir(target):
        subprocess.Popen(["explorer.exe", target if os.path.isdir(target) else os.path.expanduser("~")])
        windows = wait_window("CabinetWClass")
        if not windows:
            raise HTTPException(504, "No visible File Explorer window appeared")
        return {"ok": True, "visible": True, "windows": windows}
    if "chrome" in target.lower() or req.email or target.startswith(("https://", "http://")) or req.url:
        return open_chrome(ChromeReq(url=req.url or (target if target.startswith(("https://", "http://")) else None), email=req.email, profile=req.profile))
    try:
        previous_handles={w['handle'] for w in visible_windows()}
        display_name='Control Panel' if target.lower()=='control.exe' else Path(target).stem
        started=False
        if not os.path.exists(target) and not target.lower().endswith('.exe'):
            apps=applications().get('applications',[])
            if isinstance(apps,dict): apps=[apps]
            matches=[a for a in apps if a['Name'].lower()==target.lower()]
            if len(matches)==1:
                os.startfile('shell:AppsFolder\\'+matches[0]['AppID'])
                display_name=matches[0]['Name'];started=True
        if not started: os.startfile(target)
    except OSError as e:
        raise HTTPException(400, str(e))
    for _ in range(40):
        time.sleep(.25)
        candidates=[]
        for window in visible_windows():
            try:
                _,pid=win32process.GetWindowThreadProcessId(window['handle'])
                matches=psutil.Process(pid).name().lower()==Path(target).name.lower()
                if matches or display_name.lower() in window['title'].lower(): candidates.append(window)
            except Exception: pass
        new_candidates=[window for window in candidates if window['handle'] not in previous_handles]
        selected=new_candidates if len(new_candidates)==1 else candidates
        if len(selected)==1:
            window=selected[0]
            return {"ok":True,"launched":target,"visible":True,"verified":True,"handle":window['handle'],"windows":candidates}
    return {"ok": True, "launched": target, "verified": False}

if __name__ == "__main__":
    import uvicorn
    threading.Thread(target=watch_desktop,daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("BOPS_HARNESS_PORT", "8766")))
