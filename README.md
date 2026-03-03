# sitefetch

Fetch an entire site and save it as Markdown files (to be used with AI models).

Supports HTML pages and PDF files. HTML is converted to Markdown via [markitdown](https://github.com/microsoft/markitdown), PDF via [opendataloader-pdf](https://opendataloader.org/).

![image](https://github.com/user-attachments/assets/e6877428-0e1c-444a-b7af-2fb21ded8814)

## Install

One-off usage (choose one of the followings):

```bash
bunx sitefetch
npx sitefetch
pnpx sitefetch
```

Install globally (choose one of the followings):

```bash
bun i -g sitefetch
npm i -g sitefetch
pnpm i -g sitefetch
```

For the `--outdir` feature, you also need:

```bash
# HTML to Markdown
uv tool install markitdown

# PDF to Markdown
uv tool install opendataloader-pdf
```

## Usage

### Save as a single text file

```bash
sitefetch https://egoist.dev -o site.txt

# or better concurrency
sitefetch https://egoist.dev -o site.txt --concurrency 10
```

### Save as individual Markdown files (preserving directory structure)

```bash
sitefetch https://example.com -d ./output
```

This creates a directory structure mirroring the site:

```
output/
  example.com/
    index.md
    docs/
      guide/
        index.md
      report.md        # converted from PDF
```

Each page is saved as it is fetched (streaming), so you can see results immediately.

### Fetch a PDF directly

```bash
sitefetch https://example.com/report.pdf -d ./output
```

PDF files linked from the site are also automatically downloaded and converted to Markdown.

### Using Make

```bash
# Default output to ./output
make fetch URL=https://example.com

# Custom output directory
make fetch URL=https://example.com OUTDIR=./my-output
```

### Match specific pages

Use the `-m, --match` flag to specify the pages you want to fetch:

```bash
sitefetch https://vite.dev -m "/blog/**" -m "/guide/**"
```

The match pattern is tested against the pathname of target pages, powered by micromatch, you can check out all the supported [matching features](https://github.com/micromatch/micromatch#matching-features).

### Content selector

We use [mozilla/readability](https://github.com/mozilla/readability) to extract readable content from the web page, but on some pages it might return irrelevant contents, in this case you can specify a CSS selector so we know where to find the readable content:

```bash
sitefetch https://vite.dev --content-selector ".content"
```

## CLI Options

| Option | Description |
|---|---|
| `-o, --outfile <path>` | Write all pages to a single text or JSON file |
| `-d, --outdir <path>` | Save individual Markdown files preserving directory structure |
| `--concurrency <number>` | Number of concurrent requests (default: 3) |
| `-m, --match <pattern>` | Only fetch pages matching pattern(s) |
| `--content-selector <selector>` | CSS selector to find content area |
| `--limit <limit>` | Maximum number of pages to fetch |
| `--silent` | Suppress all logging output |

## API

```ts
import { fetchSite } from "sitefetch"

const { pages, assets } = await fetchSite("https://egoist.dev", {
  //...options
  onPage(pathname, page) {
    // called immediately when a page is fetched
  },
  onAsset(pathname, asset) {
    // called immediately when a PDF is downloaded
  },
})
```

Check out options in [types.ts](./src/types.ts).

## License

MIT.
