import path from "node:path"
import fs from "node:fs"
import { execSync } from "node:child_process"
import os from "node:os"
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

    let savedCount = 0
    const outdir = flags.outdir
    const host = outdir ? new URL(url).host : ""
    const tmpDir = outdir
      ? fs.mkdtempSync(path.join(os.tmpdir(), "sitefetch-"))
      : ""

    function savePage(pathname: string, page: { html: string }) {
      let filePath = pathname
      if (filePath.endsWith("/") || !path.extname(filePath)) {
        filePath = path.join(filePath, "index.html")
      }
      if (!filePath.endsWith(".html") && !filePath.endsWith(".htm")) {
        filePath += ".html"
      }
      const tmpPath = path.join(tmpDir, host, filePath)
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true })
      fs.writeFileSync(tmpPath, page.html, "utf8")

      // Convert HTML to md with markitdown
      const mdName = path.basename(filePath).replace(/\.html?$/, ".md")
      const destDir = path.join(outdir, host, path.dirname(filePath))
      const mdPath = path.join(destDir, mdName)
      fs.mkdirSync(destDir, { recursive: true })
      try {
        execSync(`markitdown "${tmpPath}" -o "${mdPath}"`, { stdio: "pipe" })
        savedCount++
        logger.info(`Saved ${mdPath}`)
      } catch {
        logger.warn(`markitdown failed for ${pathname}, saving raw html`)
        fs.writeFileSync(path.join(destDir, path.basename(filePath)), page.html, "utf8")
        savedCount++
      }
    }

    function saveAsset(pathname: string, asset: { data: Buffer }) {
      let filePath = pathname
      if (!filePath.endsWith(".pdf")) {
        filePath += ".pdf"
      }
      const tmpPath = path.join(tmpDir, host, filePath)
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true })
      fs.writeFileSync(tmpPath, asset.data)

      // Convert PDF to md with opendataloader-pdf
      const mdName = path.basename(filePath).replace(/\.pdf$/, ".md")
      const destDir = path.join(outdir, host, path.dirname(filePath))
      fs.mkdirSync(destDir, { recursive: true })
      try {
        execSync(`opendataloader-pdf -f markdown -o "${destDir}" "${tmpPath}"`, { stdio: "pipe" })
        savedCount++
        logger.info(`Saved ${path.join(destDir, mdName)}`)
      } catch {
        logger.warn(`opendataloader-pdf failed for ${pathname}, saving raw pdf`)
        fs.writeFileSync(path.join(destDir, path.basename(filePath)), asset.data)
        savedCount++
      }
    }

    const { pages, assets } = await fetchSite(url, {
      concurrency: flags.concurrency,
      match: flags.match && ensureArray(flags.match),
      contentSelector: flags.contentSelector,
      limit: flags.limit,
      onPage: outdir ? savePage : undefined,
      onAsset: outdir ? saveAsset : undefined,
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

    if (outdir) {
      // Clean up temp dir
      fs.rmSync(tmpDir, { recursive: true, force: true })
      logger.info(
        `Saved ${savedCount} file(s) to ${path.resolve(outdir)}`
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
