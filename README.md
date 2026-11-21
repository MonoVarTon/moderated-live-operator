# Moderated Live Operator Prototype

A local browser prototype for a human-operated live-content scene. Its default Windows demo uses fixed synthetic replies, manual review, optional browser-local speech, captions, a mute-by-default state, an emergency stop, and a small in-memory technical event log. An optional provider path exists in code but is not configured or verified here.

## Privacy and safety defaults

- No streaming-platform integration, real audience chat, account credentials, or publishing workflow is included.
- Only the fixed synthetic fixture IDs T01–T03 are accepted by the draft route; free-form audience messages are not accepted.
- The local launcher forces `LIVE_DRAFT_MODE=offline-demo`. It returns fixed replies without calling an AI provider or using model credits.
- Drafts require explicit operator review. Approval does not start speech; playback is a separate manual action.
- Speech starts muted and uses only browser voices marked local. No voice cloning or external TTS integration is included.
- The optional image preview uses an object URL in the current tab. No sample artwork or screenshots are distributed, and the selected file is not uploaded by this feature.
- Event history is limited to technical state, duration, and error codes in page memory; message and draft text are not written to the event log.
- Errors, timeouts, and rejected output fail closed; there is no automatic fallback, approval, playback, or repetition.

## Local offline demo on Windows

Use pnpm 10.18.0, pinned in `package.json`. From the repository root, install the frozen dependencies if needed, then run the Windows launcher:

```powershell
pnpm install --frozen-lockfile --node-linker=hoisted
pnpm dev:windows
```

These commands assume pnpm is available on `PATH`. If dependencies are already installed and the pnpm command is not on `PATH`, run the local script with the pinned project shim, for example `& '.\node_modules\.bin\pnpm.cmd' dev:windows`.

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The launcher sets `NODE_ENV=development`, binds only to `127.0.0.1`, forces `LIVE_DRAFT_MODE=offline-demo`, and uses port 3000 unless `PORT` is set before launch. Stop the server with Ctrl+C in its terminal.

Select one of T01–T03 and choose **Создать черновик вручную**. Review the fixed synthetic text, approve it explicitly, then unmute and use the separate playback button to test a browser voice marked local. If no such voice is available, speech remains unavailable. The emergency stop clears the text and captions, stops browser speech, blocks new speech, and requires a manual reset; reset leaves voice muted. If an in-flight draft exists, the UI sends a cancellation request keyed to its UUID and ignores stale results after stop or case change. The server aborts the matching provider request when it is still pending; cancellation at an upstream provider is best-effort and cannot retract work already processed. The offline launcher issues no upstream model request.

The route permits anonymous draft and cancellation requests only for the offline demo from loopback in development. Other requests require an authenticated admin role. The process-local cooldown is five seconds per requester; it is not a distributed production rate limiter. Provider concurrency is capped at eight in this process. JSON and urlencoded request bodies are capped at 16 KiB.

## Important limitations

This is a prototype, not a production streaming system. Provider authentication, production authorization setup, the provider call path, and any live integration have not been configured or verified. Do not expose this prototype to the public internet or treat these checks as production readiness. Emergency stop cannot guarantee cancellation of work already processed by an upstream provider; the local offline demo avoids upstream model requests entirely. No compliance assessment for any streaming platform is made here.

## Development and verification

The repository uses React, TypeScript, Vite, Express, tRPC, Vitest, and pnpm. It pins `pnpm@10.18.0`; on Windows, use the hoisted linker shown above when standard pnpm linking is blocked by symlink permissions. The lockfile remains frozen.

```bash
pnpm check
pnpm test
pnpm build
```

Verified locally on Windows on 2026-11-21 with pnpm 10.18.0: TypeScript check passed; all 24 tests across 5 files passed; production build passed. The Vite build emits a non-fatal warning that the classic `/api/platform/config.js` script cannot be bundled as a module; the runtime route is served separately. The final development HTTP smoke returned 200 for health, app page, Vite entry asset, and `/api/platform/config.js`; the runtime config used `Cache-Control: no-store`. The tRPC smoke confirmed `offline-demo`, the fixed T01 response, and that cancellation correctly found no active upstream call in offline mode. A separate smoke against the production bundle returned 200 for health, page, built asset, and runtime config; it confirmed anonymous production draft and cancellation requests are denied, without calling an upstream provider.

Do not commit `.env` files or credentials. No production deployment instructions are included because the relevant provider and production integrations have not been verified.

## Scope

This release contains no artist identity, artwork images, screenshots, account identifiers, or customer data. It is a generic technical demonstration of manual moderation and fail-closed handling, not a claim of platform approval or production readiness.
