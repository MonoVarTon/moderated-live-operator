# Moderated Live Operator Prototype

A browser-based prototype for a human-operated live-content scene. It demonstrates a local preview, synthetic test fixtures, manually requested AI drafts, operator review, optional browser-local speech, captions, a mute-by-default state, an emergency stop, and a small in-memory technical event log.

## Privacy and safety defaults

- No streaming-platform integration, real audience chat, account credentials, or publishing workflow is included.
- Only fixed synthetic fixtures may be sent to the draft service; free-form audience messages are not accepted by the server route.
- Drafts require explicit operator review. Approval does not start speech; playback is a separate manual action.
- Speech starts muted and uses only browser voices marked local. No voice cloning or external TTS integration is included.
- The optional image preview uses an object URL in the current tab. No sample artwork or screenshots are distributed, and the selected file is not uploaded by this feature.
- Event history is limited to technical state, duration, and error codes in page memory; message and draft text are not written to the event log.
- Errors, timeouts, and rejected output fail closed; there is no automatic fallback, approval, playback, or repetition.

## Important limitations

This is a prototype, not a production streaming system. The draft endpoint currently uses a public procedure and must not be exposed to untrusted traffic. The emergency stop blocks speech and ignores stale UI results but cannot guarantee cancellation of an already-issued upstream model request. Add authenticated operator access, provider-side abuse controls, and verifiable cancellation before deployment.

A compatible AI provider and model must be configured for the server adapter; a live model call was not part of the verified test run. Unit tests use a mock invoker. No compliance assessment for any streaming platform is made here.

## Development

The repository uses React, TypeScript, Vite, Express, tRPC, and pnpm.

The project pins `pnpm@10.18.0`. On Windows, use the hoisted linker shown below when standard pnpm linking is blocked by symlink permissions; the lockfile remains frozen.

```bash
pnpm install --frozen-lockfile --node-linker=hoisted
pnpm check
pnpm test
pnpm build
```

Verified locally on Windows with pnpm 10.18.0 on 2026-11-21: the type check, all 14 tests across 3 files, and the production build passed. `pnpm ignored-builds` reported no ignored builds. Vite emitted a non-fatal warning that `/api/platform/config.js` cannot be bundled without `type="module"`; this platform boundary still requires review before any production work.

The default runtime expects the platform adapter and environment variables described in `server/_core/env.ts`. Do not commit `.env` files or credentials. Standalone deployment, provider authentication, and live integration setup are not verified; this README does not provide production deployment instructions.

## Scope

This release contains no artist identity, artwork images, screenshots, account identifiers, or customer data. It is a generic technical demonstration of manual moderation and fail-closed handling, not a claim of platform approval or production readiness.
