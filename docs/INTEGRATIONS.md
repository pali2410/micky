# Upstream integrations

## Exact source revisions

| Repository | Pinned commit | Micky changes |
| --- | --- | --- |
| [Bigfoot](https://github.com/jhmeel/bigfoot) | `95f7ffdb29ff49efe321a96c9caa3e5c8c94a1e6` | Patch + added files |
| [HeyJev](https://github.com/henryklunaris/hey-jev) | `24e4b378350d999d2b45ff2549ea039c2bc7863d` | Patch + added files |
| [OpenMausBot](https://github.com/milind-soni/OpenMausBot) | `7ea18ea49ce3e8933eb2e362010f1a41fb4b3435` | Patch + added files |
| [Rakazo](https://github.com/elie222/rakazo) | `9d2248c3667b4dadf711cbb7bf82309d8de9dfe6` | Patch + added files |
| [RobotHeads](https://github.com/fayazara/robot-heads) | `58ebf6439a8125a769f63b22ffd35bc18834b1b5` | Pinned source |

DeepSeek is installed separately as `@deepseek-ai/dsh` and `@deepseek-ai/dsh-llm-pi-ai`, pinned to `0.2.0-rc.2` in `runtimes/deepseek/package-lock.json`. See [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) for the upstream project; this snapshot integrates the npm SDK rather than a copied entire checkout.

## How modified upstream source is preserved

Git submodules point to original upstream commits. `integrations/patches/` contains tracked-file changes, and `integrations/overlays/` contains new Windows/local integration files. `node scripts/prepare-upstreams.cjs` initializes the pinned checkouts and applies both. It accepts already-applied patches, rejects incompatible revisions/conflicts and preserves locally changed overlay files instead of overwriting them.

After preparation, modified submodules appearing dirty in `git status` is expected: their changes are represented in the parent repository's patches. When changing an integration, refresh its patch/overlay alongside the code. Do not commit private configuration or generated databases to the upstream checkout.

## Integration scope

- **Maus:** local compatible provider, Windows tool MCP connection, application switching, local settings/browser changes and actual managed bot identities. Retains upstream workspace modules.
- **Rakazo:** local deployment/model UI, persistent native host/database, machine-local session, bridge MCP assignments and bounded teammate coordination.
- **Bigfoot:** original native application plus shared Windows helper; external local model runtime, installed model selector, screenshot-to-vision observation routing and snapshot/targeting changes.
- **HeyJev:** original command/timer/Recorder/Dictation engine adapted to Windows, native Tk GUI, local LLM classification/chat, local Whisper, Windows speech, system/app/media actions and bridge browser commands. Mac/cloud source remains in its pinned checkout; the Windows entry point uses replacement providers.
- **RobotHeads:** avatar visualization/editing component; it is not an agent executor.
- **DeepSeek SDK:** optional local planning/advice/tool loop with per-task bridge tools and persisted SDK sessions. Experimental behavior is not enabled or certified wholesale.

Native apps and managed workspaces retain separate conversations. Shared model availability and task status connect them; there is no claim that all upstream memory stores or internal agent frameworks have been flattened into one.

## Removed engine

Munder is not a submodule or active runtime in this repository. Old Munder state is handled by the migration logic so assignments cannot replay into another application. The local removal archive and historical chats are intentionally not uploaded.
