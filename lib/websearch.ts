import https from 'node:https'

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

function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (res.headers.location.startsWith('http')) {
            return fetchJson(res.headers.location, headers).then(resolve).catch(reject)
          }
        }
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (err) {
            reject(err)
          }
        })
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

  // 1. Search Wikipedia API (Free, high quality general knowledge)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      cleanQuery
    )}&utf8=&format=json`
    const wikiData = await fetchJson(wikiUrl, {
      'User-Agent': 'SuperChatApp/1.0 (contact@superchat.local)',
    })
    const wikiList = wikiData?.query?.search || []
    for (const item of wikiList.slice(0, 3)) {
      const title = String(item.title || '').trim()
      if (!title || seenTitles.has(title.toLowerCase())) continue
      seenTitles.add(title.toLowerCase())

      const snippet = String(item.snippet || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .trim()
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`
      if (snippet) {
        results.push({ title, url, snippet, source: 'Wikipedia' })
      }
    }
  } catch {
    /* fallback silently */
  }

  // 2. Search Wikinews API (Free, news & current affairs context)
  try {
    const newsUrl = `https://en.wikinews.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      cleanQuery
    )}&utf8=&format=json`
    const newsData = await fetchJson(newsUrl, {
      'User-Agent': 'SuperChatApp/1.0 (contact@superchat.local)',
    })
    const newsList = newsData?.query?.search || []
    for (const item of newsList.slice(0, 3)) {
      const title = String(item.title || '').trim()
      if (!title || seenTitles.has(title.toLowerCase())) continue
      seenTitles.add(title.toLowerCase())

      const snippet = String(item.snippet || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .trim()
      const url = `https://en.wikinews.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`
      if (snippet) {
        results.push({ title, url, snippet, source: 'Wikinews' })
      }
    }
  } catch {
    /* fallback silently */
  }

  // Build formatted grounding prompt text
  let formattedContext = ''
  if (results.length > 0) {
    formattedContext = `[Web Search Grounding Data for "${cleanQuery}"]\n`
    results.forEach((item, index) => {
      formattedContext += `Source [${index + 1}] (${item.source}): ${item.title} (${item.url})\nSnippet: ${item.snippet}\n\n`
    })
    formattedContext += `Instructions: Use the above real-time Web Search Grounding Data to inform your answer. Cite your sources using [1], [2], etc., when referencing specific facts.`
  }

  return {
    query: cleanQuery,
    formattedContext,
    results,
  }
}

