# WrongMath

**Photograph a math worksheet → get a printable sheet of the questions your kid got wrong.**

Every question is re-typeset and every geometry figure is redrawn as SVG, so the output is a clean
worksheet the child can redo — no scanned images, no handwriting to squint at.

[中文说明](README_zh.md)

## How it works

```
photos ──► preprocess ──► transcribe (2–3 rounds, voted) ──► judge (3 votes) ──► printable HTML
           upscale 2.5×     read stems, answers,        teacher mark
           red-ink mask     red marks, figures          independent solve
                                                        rule checks
```

- **Transcription is voted, not trusted.** The model misreads red-pen marks and question numbers
  run to run, so each page is transcribed two or three times and the results are aligned by
  stem similarity before voting.
- **Marks are checked against the red ink.** When the model claims it saw a ✗, the pixels inside
  the box it reported must actually be red, otherwise the claim is dropped.
- **Wrong answers are judged three ways**: the teacher's mark, an independent solve, and
  deterministic rules (division identities, impossible dimensions, …).

## Quick start

```bash
pnpm install
cp .env.example .env      # fill in OPENCODE_GO_API_KEY
pnpm dev                  # http://localhost:19238
```

Upload a few photos, wait (~5–9 minutes per page — the model spends most of that reasoning),
then download the generated worksheet.

## CLI

```bash
pnpm mask   <image> <out.png>                 # visualise the red-ink mask
pnpm judge  <image> [--mask <image>]          # run the full pipeline for one page
pnpm judge  --replay <page.json>              # offline re-judge a saved transcription
pnpm render <questions.json> <out.html>       # render a worksheet from saved questions
```

## Tests

```bash
pnpm test          # unit tests; the golden test runs against the real model when a key is set
pnpm typecheck
pnpm build
```

## Layout

```
packages/core   ingest · vlm · judge · render (the pipeline, no UI)
packages/web    Next.js app: upload, batch progress, download
docs/           knowledge base (architecture, data, API, ops) + design notes
deploy/         systemd unit, launchd plist
```

## Requirements

Node ≥ 24, pnpm 12. Vision model: `deepseek-v4.1-flash` via OpenCode Go (configurable through
`WM_PROVIDER`).

## License

MIT
