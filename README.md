# TechSpotter

Drop a screenplay PDF, get the scene-by-character matrix plus two department
spotting layers: Sound (playback, phone calls, sound reactions) and Video
(phone screens, TV screens, video playback).

**All processing happens in your browser. Your script never leaves your
device.** After page load the site makes zero network requests: no CDNs, no
analytics, no telemetry.

Live at https://gotham-sound.github.io/techspotter/ — drop a PDF, review the
matrix, correct the parser with clicks. A fully synthetic demo show (generated
in your browser, no script text anywhere) is at
https://gotham-sound.github.io/techspotter/#demo

The full brief is live: the scene-by-character matrix with review rails and
source peek (hover any flagged artifact to see the original page region),
the 🔊 Sound and 🎬 Video spotting layers with per-moment evidence and
dismiss, presence tracking (speaks vs present-no-lines), and exports:
`.sceneline` interchange v2 (lean or full profile, round-trip preservation
of other tools' blocks), matrix CSV, a three-sheet XLSX workbook, and a
letter-landscape print stylesheet. Drop a `.sceneline` back in to resume a
reviewed show instantly.

## Development

```
npm install
npm test
```

Tests run in Node against synthetic screenplay PDFs generated in memory by
`test/fixtures/` at test time. No real screenplay material may ever enter this
repo: `.gitignore` blocks `*.pdf` and `*.sceneline`, and fixtures are always
generated, never copied.

## License

MIT, see [LICENSE](LICENSE). The bundled libraries in `vendor/` (pdf.js,
SheetJS) are Apache-2.0 and keep their own license notices in-file.

## Docs

- `docs/techspotter-build-brief.md`: the build brief (parser rules, department
  detectors, acceptance tests)
- `docs/sceneline-interchange-v2.md`: the `.sceneline` interchange format
  shared with the sibling tools (Sceneline, Tablecut, sides-enlarger)
