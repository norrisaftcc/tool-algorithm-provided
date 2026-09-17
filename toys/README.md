# toys

Small, self-contained web things. Spikes, knick-knacks, teaching aids.

House rules for anything that lands here:

- **One folder per toy.** No shared build, no shared dependency tree.
- **No build step.** Open `index.html` and it works. No npm, no bundler, no CDN.
- **Works from `file://` and from GitHub Pages.** That means classic scripts
  rather than ES modules, and hash-based routing rather than the History API.
- **Degrades without network and without `localStorage`.** Web fonts are an
  enhancement, never a requirement. Persistence failures are reported, not fatal.

| Toy | What it is |
|---|---|
| [`typing-tutor/`](typing-tutor/) | A retro typing tutor: home keys, then real Python and C++ lines. |
