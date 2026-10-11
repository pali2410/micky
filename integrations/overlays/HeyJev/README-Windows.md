# HeyJev on Windows inside Micky

Run `node E:/micky/HeyJev/windows.cjs` or select HeyJev voice in Micky.
This Windows entry point uses local Bigfoot Whisper transcription, Windows wake recognition and local Windows speech synthesis. Voice commands enter the same Micky task pipeline as typed commands. Optional dictation copies text to the clipboard instead of executing a task. Add correction mappings at `.data/heyjev/vocabulary.json` as `{ "correct word": ["misheard phrase"] }`.

No macOS Cocoa, AppleScript, Keychain, TypeSafe, Fish Audio or OpenRouter is loaded by this entry point. It uses Micky's installed Electron runtime; there are no extra Python dependencies. Original macOS files are preserved for reference. The macOS-only app interface, Spotify-specific AppleScript, and original cloud providers have not been ported. This is a Windows integration, not the original Mac application running unchanged.
