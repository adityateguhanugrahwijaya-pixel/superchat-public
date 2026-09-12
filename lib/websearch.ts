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

function fetchText(targetUrl: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith('https') ? https : http
    const req = client.get(
      targetUrl,
      {
        rejectUnauthorized: false,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (res.headers.location.startsWith('http')) {
            return fetchText(res.headers.location, headers).then(resolve).catch(reject)
          }
        }
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve(data))
      }
    )
    req.on('error', reject)
    req.setTimeout(6000, () => {
      req.destroy()
      reject(new Error('Search request timeout'))
    })
  })
}

export async function performWebSearch(query: string): Promise<WebSearchResult> {
  const cleanQuery = query.trim().slice(0, 150)
  const results: SearchResultItem[] = []
  const seenTitles = new Set<string>()

  // 1. DuckDuckGo Instant Answer / HTML Search (Free universal web search)
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`
    const ddgHtml = await fetchText(ddgUrl)
    const regex = /<a class="result__snippet[^>]* href="([^"]+)"[^>]*>(.*?)<\/a>/g
    let match
    let count = 0
    while ((match = regex.exec(ddgHtml)) !== null && count < 4) {
      const rawUrl = match[1]
      const snippet = match[2].replace(/<[^>]+>/g, '').trim()
      if (snippet && !seenTitles.has(snippet.toLowerCase())) {
        seenTitles.add(snippet.toLowerCase())
        results.push({
          title: `Web Result ${count + 1}`,
          url: rawUrl,
          snippet,
          source: 'DuckDuckGo Web',
        })
        count++
      }
    }
  } catch {
    /* fallback silently */
  }

  // 2. Wikipedia Search API (Free general knowledge)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      cleanQuery
    )}&utf8=&format=json`
    const rawWiki = await fetchText(wikiUrl, { 'User-Agent': 'SuperChatApp/1.0' })
    const wikiData = JSON.parse(rawWiki)
    const wikiList = wikiData?.query?.search || []
    for (const item of wikiList.slice(0, 3)) {
      const title = String(item.title || '').trim()
      if (!title || seenTitles.has(title.toLowerCase())) continue
      seenTitles.add(title.toLowerCase())

      const snippet = String(item.snippet || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .trim()
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`
      if (snippet) {
        results.push({ title, url, snippet, source: 'Wikipedia' })
      }
    }
  } catch {
    /* fallback silently */
  }

  // Build formatted grounding prompt text
  let formattedContext = ''
  if (results.length > 0) {
    formattedContext = `[Web Search Grounding Context for "${cleanQuery}"]\n`
    results.forEach((item, index) => {
      formattedContext += `Source [${index + 1}] (${item.source}): ${item.title}\nURL: ${item.url}\nSnippet: ${item.snippet}\n\n`
    })
    formattedContext += `Instructions: Use the above real-time Web Search Grounding Context to answer the user accurately. Cite sources when referencing specific web facts.`
  }

  return {
    query: cleanQuery,
    formattedContext,
    results,
  }
}
