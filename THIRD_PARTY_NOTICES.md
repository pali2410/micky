# Third-party source and notices

Micky connects independent upstream applications. Their original license/notices remain in the pinned submodules. Root Micky code is not being relicensed on their behalf.

| Project | Source / distribution boundary |
| --- | --- |
| Bigfoot | Pinned original source plus identified modifications; GPL-3.0-or-later notices retained. Source patches and added adapter files are provided. |
| OpenMausBot | Pinned source and its original license/notices; selected provider files under `vendor/openmaus` retain their LICENSE/NOTICE. |
| Rakazo | Pinned source and original Apache-2.0 licensing/notices. |
| HeyJev | Original source remains a linked pinned checkout. No license file was found in that revision; this repository does not invent a redistribution license for it. Added Windows files and recorded modifications are distinguished from upstream. |
| RobotHeads | Pinned source and its existing upstream notices. |
| DeepSeek Harness | Exact npm SDK dependencies in the runtime lockfile; their package notices apply. |

Model weights, Whisper/Node/PostgreSQL binaries and installed dependencies are obtained separately. Their own licenses apply; they are not bundled in this repository. Existing visual assets are not automatically relicensed by this source publication.

See `integrations/upstreams.json` and `docs/INTEGRATIONS.md` for exact revisions and how to reconstruct modified source. Check the relevant project's license before redistributing a combined application or binaries.
