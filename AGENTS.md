# Agent notes

## Build

When asked to build the app (alone or together with commit/push), run:

```bash
npm run app:mac
```

Do not use `npm run build` (tsc + Vite only) in its place.

## Checks

- `npm run check:web` — vitest plus `tsc --noEmit`
- `npm run check:rust` — `cargo fmt --check`, clippy with `-D warnings`, Rust tests
- `npm test` — web tests only

## Fork guidelines

This repository is a fork of `hardbeat920/monocode` with a redesigned UI.
When merging upstream releases, keep this fork's design, layout and pt-BR
surfaces, grafting upstream behavior in without replacing the fork's chrome,
typography or strings. Features that intentionally stay unported are listed
in the merge commits.
