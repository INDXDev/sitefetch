import path from "node:path"
import fs from "node:fs"
import { cac } from "cac"
import { encode } from "gpt-tokenizer/model/gpt-4o"
import { fetchSite, serializePages } from "./index.ts"
import { logger } from "./logger.ts"
import { ensureArray, formatNumber } from "./utils.ts"
import { version } from "../package.json"

const cli = cac("sitefetch")

cli
  .command("[url]", "Fetch a site")
  .option("-o, --outfile <path>", "Write the fetched site to a text file")
  .option(
    "-d, --outdir <path>",
    "Save files preserving directory structure (HTML and PDF)"
  )
  .option("--concurrency <number>", "Number of concurrent requests", {
    default: 3,
  })
  .option("-m, --match <pattern>", "Only fetch matched pages")
  .option("--content-selector <selector>", "The CSS selector to find content")
  .option("--limit <limit>", "Limit the result to this amount of pages")
  .option("--silent", "Do not print any logs")
  .action(async (url, flags) => {
    if (!url) {
      cli.outputHelp()
      return
    }

    if (flags.silent) {
      logger.setLevel("silent")
    }

    const { pages, assets } = await fetchSite(url, {
      concurrency: flags.concurrency,
      match: flags.match && ensureArray(flags.match),
      contentSelector: flags.contentSelector,
      limit: flags.limit,
    })

    if (pages.size === 0 && assets.size === 0) {
      logger.warn("No pages found")
      return
    }

    const pagesArr = [...pages.values()]

    const totalTokenCount = pagesArr.reduce(
      (acc, page) => acc + encode(page.content).length,
      0
    )

    logger.info(
      `Total token count for ${pages.size} pages: ${formatNumber(
        totalTokenCount
      )}`
    )

    if (assets.size > 0) {
      logger.info(`Found ${assets.size} PDF file(s)`)
    }

    if (flags.outdir) {
      const siteUrl = new URL(url)
      const host = siteUrl.host
      let savedCount = 0

      // Save HTML pages
      for (const [pathname, page] of pages) {
        let filePath = pathname
        if (filePath.endsWith("/") || !path.extname(filePath)) {
          filePath = path.join(filePath, "index.html")
        }
        if (!filePath.endsWith(".html") && !filePath.endsWith(".htm")) {
          filePath += ".html"
        }

        const fullPath = path.join(flags.outdir, host, filePath)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, page.html, "utf8")
        savedCount++
      }

      // Save PDF assets
      for (const [pathname, asset] of assets) {
        let filePath = pathname
        if (!filePath.endsWith(".pdf")) {
          filePath += ".pdf"
        }

        const fullPath = path.join(flags.outdir, host, filePath)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, asset.data)
        savedCount++
      }

      logger.info(
        `Saved ${savedCount} file(s) to ${path.resolve(flags.outdir)}`
      )
    } else if (flags.outfile) {
      const output = serializePages(
        pages,
        flags.outfile.endsWith(".json") ? "json" : "text"
      )
      fs.mkdirSync(path.dirname(flags.outfile), { recursive: true })
      fs.writeFileSync(flags.outfile, output, "utf8")
    } else {
      console.log(serializePages(pages, "text"))
    }
  })

cli.version(version)
cli.help()
cli.parse()
