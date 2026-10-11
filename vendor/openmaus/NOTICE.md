Selected OpenMausBot provider components, copyright their upstream contributors, licensed under Apache-2.0.

Source: https://github.com/milind-soni/OpenMausBot
Revision: 978993c84e2ec17144fcf46e7bfa1e04c9f32a4b

Copied retry.ts, openai-chat-protocol.ts and provider-safety.ts. contracts.ts contains only the ProviderErrorCode type. The retry imports omit TypeScript suffixes for Next.js compilation. Micky uses the retry policy only for model requests; it never replays a desktop mutation or message submission.
