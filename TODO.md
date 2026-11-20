# Release readiness checklist

## Verified in the originating development environment

- TypeScript check passed.
- Unit tests passed: 14 tests across 3 files.
- Production build passed.
- No live model invocation, external TTS, audience-chat feed, or streaming connection was used during those checks.

## Required before any real deployment

- [ ] Replace the public draft procedure with authenticated, rate-limited operator access.
- [ ] Prove cancellation of in-flight model requests and enforce provider-side spend controls.
- [ ] Configure a supported model/provider in the target environment; keep credentials outside Git.
- [ ] Run full browser end-to-end tests for selection, draft, edit, approval, captions, local speech, mute, emergency stop, and reset.
- [ ] Review current official rules for the selected streaming platform before implementing an adapter.
- [ ] Conduct a privacy and security review of all logs, dependencies, and deployment configuration.
- [ ] Select and verify a license only after confirming rights and provenance for every distributed component.

## Explicitly out of scope

- Real platform APIs, accounts, audience comments, publishing, and going live.
- External or cloned voices.
- Automated approvals, autoplay, repeated speech, or persistent comment storage.
- Artwork, personal identity, customer data, and screenshots.