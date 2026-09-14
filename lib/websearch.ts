import https from 'node:https'
import http from 'node:http'

export type SearchResultItem = {
  title: string
  url: string
  snippet: string
  source: string
}

export type WebSearchResult = {
  query: string
  formattedContext: string
  results: SearchResultItem[]
}

function fetchText(targetUrl: string, postData = '', headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl)
    const client = targetUrl.startsWith('https') ? https : http
    const opts: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (targetUrl.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: postData ? 'POST' : 'GET',
      rejectUnauthorized: false,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        ...headers,
      },
    }

    if (postData) {
      opts.headers!['Content-Type'] = 'application/x-www-form-urlencoded'
      opts.headers!['Content-Length'] = Buffer.byteLength(postData)
    }

    const req = client.request(opts, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, targetUrl).toString()
        return fetchText(redirectUrl, '', headers).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    })

    req.on('error', reject)
    req.setTimeout(8000, () => {
      req.destroy()
      reject(new Error('Search request timeout'))
    })

    if (postData) {
      req.write(postData)
    }
    req.end()
  })
}

export async function performWebSearch(query: string): Promise<WebSearchResult> {
  const cleanQuery = query.trim().slice(0, 150)
  const results: SearchResultItem[] = []
  const seenUrls = new Set<string>()

  // 1. DuckDuckGo Lite Search
  try {
    const postData = `q=${encodeURIComponent(cleanQuery)}`
    const html = await fetchText('https://lite.duckduckgo.com/lite/', postData)

    const linkRegex = new RegExp('<a[^>]+href=["\']([^"\']+)["\'][^>]*class=["\']result-link["\'][^>]*>([\\s\\S]*?)<\\/a>', 'gi')
    const snippetRegex = new RegExp('<td[^>]*class=["\']result-snippet["\'][^>]*>([\\s\\S]*?)<\\/td>', 'gi')

    const links: { title: string; url: string }[] = []
    const snippets: string[] = []

    let match: RegExpExecArray | null
    while ((match = linkRegex.exec(html)) !== null) {
      const rawUrl = match[1]
      let cleanUrl = rawUrl
      const uddgMatch = /uddg=([^&]+)/.exec(rawUrl)
      if (uddgMatch) {
        try {
          cleanUrl = decodeURIComponent(uddgMatch[1])
        } catch {
          cleanUrl = rawUrl
        }
      }
      const title = match[2].replace(/<[^>]+>/g, '').trim()
      links.push({ title, url: cleanUrl })
    }

    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(match[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim())
    }

    for (let i = 0; i < Math.min(links.length, 6); i++) {
      const link = links[i]
      const snippet = snippets[i] || ''
      if (link.url && !seenUrls.has(link.url.toLowerCase())) {
        seenUrls.add(link.url.toLowerCase())
        results.push({
          title: link.title || `Web Result ${i + 1}`,
          url: link.url,
          snippet,
          source: 'Web Search',
        })
      }
    }
  } catch {
    /* fallback silently */
  }

  // 2. Wikipedia Search API (Indonesian & English)
  for (const lang of ['id', 'en']) {
    try {
      const wikiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        cleanQuery
      )}&utf8=&format=json`
      const rawWiki = await fetchText(wikiUrl, '', { 'User-Agent': 'SuperChatApp/1.0' })
      const wikiData = JSON.parse(rawWiki)
      const wikiList = wikiData?.query?.search || []
      for (const item of wikiList.slice(0, 3)) {
        const title = String(item.title || '').trim()
        const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`
        if (!title || seenUrls.has(url.toLowerCase())) continue
        seenUrls.add(url.toLowerCase())

        const snippet = String(item.snippet || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim()

        if (snippet) {
          results.push({ title: `${title} (${lang.toUpperCase()} Wikipedia)`, url, snippet, source: `${lang.toUpperCase()} Wikipedia` })
        }
      }
    } catch {
      /* fallback silently */
    }
  }

  // Build formatted grounding prompt text
  let formattedContext = ''
  if (results.length > 0) {
    formattedContext = `[REAL-TIME WEB SEARCH GROUNDING CONTEXT FOR "${cleanQuery}"]\n\n`
    results.forEach((item, index) => {
      formattedContext += `[Source ${index + 1}] Title: ${item.title}\nURL: ${item.url}\nSnippet: ${item.snippet}\n\n`
    })
    formattedContext +=
      `STRICT CITATION MANDATE:\n` +
      `- You MUST incorporate information from the web search results above.\n` +
      `- You MUST cite your references using markdown links like [Source Title](URL) directly in your response.\n` +
      `- Always include clickable markdown links [Title](URL) for the sources you use so the user can verify them.`
  }

  return {
    query: cleanQuery,
    formattedContext,
    results,
  }
}
