# Windows installation

This is a source distribution. It excludes downloaded models, compiled executables, installed dependencies, databases, browser profiles and private configuration. Run it on a Windows development machine; the snapshot was exercised with Python 3.13 and Node 24.

## 1. Clone and restore the source integrations

```powershell
git clone --recurse-submodules https://github.com/pali2410/micky.git
cd micky
node scripts/prepare-upstreams.cjs
Copy-Item .env.example .env.local
```

Choose installed model names in `.env.local`. Never commit that file. Run the preparation command before building the upstream applications. It preserves their original licenses and applies this repository's Windows/local modifications.

## 2. Micky dependencies and local models

Install Git, Node.js 24, Python 3.13 with Tcl/Tk, Ollama, and pnpm 9.15.0. Install a C# compiler compatible with Bigfoot's native build script. FFmpeg is also used by optional media paths in the existing setup.

```powershell
npm ci
python -m pip install -r requirements.txt
ollama pull qwen2.5:3b
ollama pull phi4-mini
ollama pull qwen2.5vl:3b
```

Skip model downloads when those models already exist. Additional installed models can be selected in the UI, but small-model command/tool quality varies. Keep the Python harness URL and port consistent; the sample configuration uses 8766.

## 3. Managed workspace dependencies

```powershell
npm --prefix OpenMausBot install
npm --prefix OpenMausBot run build
pnpm --dir Rakazo install --frozen-lockfile
$env:VITE_MICKY_LOCAL_ONLY = '1'
pnpm --dir Rakazo --filter @rakazo/web build
npm --prefix runtimes/postgres ci
```

Rakazo's current host expects its bundled Node 24 path. Restore that verified runtime rather than committing an executable:

```powershell
./scripts/install-node24.ps1
```

The helper downloads the pinned official Windows x64 Node archive and checks SHA-256 against Node's official checksum list before extraction. PostgreSQL binaries are installed by the embedded-postgres dependency. First startup creates local configuration, generated credentials, a local identity and persistent database under `.data/`.

Maus's first startup creates its local-model/MCP configuration under `.data/openmaus`. Its UI build must exist before the Electron lifecycle starts it.

## 4. Native Bigfoot and HeyJev

```powershell
npm --prefix Bigfoot install --ignore-scripts --no-audit --no-fund
node Bigfoot/scripts/build-native.js --force
node Bigfoot/scripts/build-icons.js
node scripts/install-local-speech.cjs
python -m venv HeyJev/.venv
./HeyJev/.venv/Scripts/python.exe -m pip install -r integrations/overlays/HeyJev/requirements-windows.lock.txt
```

Bigfoot uses Micky's installed Electron executable when launched from its sidebar. It has a separate local profile under `.data/bigfoot`. Its local model adapter reuses Ollama and does not download a second LLM.

HeyJev's native GUI uses the isolated Python environment. Its first voice start downloads the original faster-whisper `small.en` model into `.data/heyjev/models`; subsequent speech recognition runs locally. For a separate preload check:

```powershell
Push-Location HeyJev
./.venv/Scripts/python.exe -c "import windows_backend; windows_backend.whisper(); print('Whisper ready')"
Pop-Location
```

## 5. Optional DeepSeek SDK

```powershell
npm --prefix runtimes/deepseek ci
```

Set only the modes you intend to use in `.env.local`:

```text
BOPS_PLANNER_ENGINE=deepseek
BOPS_REASONING_ENGINE=deepseek
BOPS_EXECUTION_ENGINE=deepseek
```

These options select an SDK agent loop, not a required DeepSeek model download. The default local planner remains available. The SDK requires Node 24 and uses the installed local models through a loopback gateway. Optional upstream experimental plugins are not all installed by this step.

## 6. Build and run

```powershell
$env:MICKY_BUILD_DIR = '.next-native'
npm run build
npm run app
```

Electron checks/starts its local services. The sidebar switches to Maus/Rakazo and opens the actual Bigfoot/HeyJev application windows. Use **Start listening** in HeyJev, or its Settings page for continuous/wake/PTT mode, microphone selection and Windows speech.

## Troubleshooting

- **App workspace offline:** inspect `.logs/openmaus.native.log` or `.logs/rakazo.native.log`; verify its source patch and UI build.
- **Native app startup failed:** inspect `.logs/bigfoot.application.log` or `.logs/heyjev.application.log`; check helper/Python installation.
- **Wrong/empty local response:** confirm the model is installed and appropriate for tool/schema/vision work. Change it in the local model selector.
- **Microphone unavailable:** select an actual Windows input device in HeyJev; automatic selection prefers an available Bluetooth headset and otherwise the system input.
- **Old interface after rebuilding:** an already-running renderer on port 3000 can be reused. Close the previous Micky instance and verify which project owns the port before restarting.
- **Phone/device setup:** configure the optional phone gateway or Android path in the relevant application; neither a running model nor an enabled browser implies Android/LAN connectivity has been verified.

Do not copy another user's `.data`, `.env.local` or browser profile to make setup work. New installations should generate their own identities and credentials.
