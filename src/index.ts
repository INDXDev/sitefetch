import Queue from "p-queue"
import { Window } from "happy-dom"
import { Readability } from "@mozilla/readability"
import c from "picocolors"
import { toMarkdown } from "./to-markdown.ts"
import { logger } from "./logger.ts"
import { load } from "cheerio"
import { matchPath } from "./utils.ts"
import type { Options, FetchSiteResult, FetchResult, Asset } from "./types.ts"

export async function fetchSite(
  url: string,
  options: Options
): Promise<FetchResult> {
  const fetcher = new Fetcher(options)

  return fetcher.fetchSite(url)
}

class Fetcher {
  #pages: FetchSiteResult = new Map()
  #assets: Map<string, Asset> = new Map()
  #fetched: Set<string> = new Set()
  #queue: Queue

  constructor(public options: Options) {
    const concurrency = options.concurrency || 3
    this.#queue = new Queue({ concurrency })
  }

  #limitReached() {
    return this.options.limit && this.#pages.size >= this.options.limit
  }

  #getContentSelector(pathname: string) {
    if (typeof this.options.contentSelector === "function")
      return this.options.contentSelector({ pathname })

    return this.options.contentSelector
  }

  async fetchSite(url: string): Promise<FetchResult> {
    logger.info(
      `Started fetching ${c.green(url)} with a concurrency of ${
        this.#queue.concurrency
      }`
    )

    await this.#fetchPage(url, {
      skipMatch: true,
    })

    await this.#queue.onIdle()

    return { pages: this.#pages, assets: this.#assets }
  }

  async #fetchPage(
    url: string,
    options: {
      skipMatch?: boolean
    }
  ) {
    const { host, pathname } = new URL(url)

    if (this.#fetched.has(pathname) || this.#limitReached()) {
      return
    }

    this.#fetched.add(pathname)

    // return if not matched
    // we don't need to extract content for this page
    if (
      !options.skipMatch &&
      this.options.match &&
      !matchPath(pathname, this.options.match)
    ) {
      return
    }

    logger.info(`Fetching ${c.green(url)}`)

    const res = await (this.options.fetch || fetch)(url, {
      headers: {
        "user-agent": "Sitefetch (https://github.com/egoist/sitefetch)",
      },
    })

    if (!res.ok) {
      logger.warn(`Failed to fetch ${url}: ${res.statusText}`)
      return
    }

    if (this.#limitReached()) {
      return
    }

    const contentType = res.headers.get("content-type")

    // Handle PDF files
    if (contentType?.includes("application/pdf")) {
      logger.info(`Downloading PDF ${c.green(url)}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const asset = { url, data: buffer, contentType: "application/pdf" }
      this.#assets.set(pathname, asset)
      this.options.onAsset?.(pathname, asset)
      return
    }

    if (!contentType?.includes("text/html")) {
      logger.warn(`Not a HTML page: ${url}`)
      return
    }

    const resUrl = new URL(res.url)

    // redirected to other site, ignore
    if (resUrl.host !== host) {
      logger.warn(`Redirected from ${host} to ${resUrl.host}`)
      return
    }
    const extraUrls: string[] = []

    const rawHtml = await res.text()
    const $ = load(rawHtml)
    $("script,style,link,img,video").remove()

    $("a").each((_, el) => {
      const href = $(el).attr("href")

      if (!href) {
        return
      }

      try {
        const thisUrl = new URL(href, url)
        if (thisUrl.host !== host) {
          return
        }

        extraUrls.push(thisUrl.href)
      } catch {
        logger.warn(`Failed to parse URL: ${href}`)
      }
    })

    if (extraUrls.length > 0) {
      for (const url of extraUrls) {
        this.#queue.add(() =>
          this.#fetchPage(url, { ...options, skipMatch: false })
        )
      }
    }

    const window = new Window({
      url,
      settings: {
        disableJavaScriptFileLoading: true,
        disableJavaScriptEvaluation: true,
        disableCSSFileLoading: true,
      },
    })

    const pageTitle = $("title").text()
    const contentSelector = this.#getContentSelector(pathname)
    const html = contentSelector
      ? $(contentSelector).prop("outerHTML")
      : $.html()

    if (!html) {
      logger.warn(`No readable content on ${pathname}`)
      return
    }

    window.document.write(html)

    await window.happyDOM.waitUntilComplete()

    const article = new Readability(window.document as any).parse()

    await window.happyDOM.close()

    if (!article) {
      return
    }

    const content = toMarkdown(article.content)

    const page = {
      title: article.title || pageTitle,
      url,
      content,
      html: rawHtml,
    }
    this.#pages.set(pathname, page)
    this.options.onPage?.(pathname, page)
  }
}

export function serializePages(
  pages: FetchSiteResult,
  format: "json" | "text"
): string {
  if (format === "json") {
    return JSON.stringify(
      [...pages.values()].map(({ html: _, ...rest }) => rest)
    )
  }

  return [...pages.values()]
    .map((page) =>
      `<page>
  <title>${page.title}</title>
  <url>${page.url}</url>
  <content>${page.content}</content>
</page>`.trim()
    )
    .join("\n\n")
}
