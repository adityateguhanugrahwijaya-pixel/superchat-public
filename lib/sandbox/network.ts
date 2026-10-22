import http from 'node:http'
import net from 'node:net'

export type NetworkPolicy = 'open' | 'proxy' | 'off'

const DEFAULT_ALLOWED_DOMAINS = [
  'pypi.org',
  'pythonhosted.org',
  'files.pythonhosted.org',
  'registry.npmjs.org',
  'npmjs.org',
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'huggingface.co',
  'cdn-lfs.huggingface.co',
]

let activeProxyServer: http.Server | null = null
let activeProxyPort: number | null = null

/**
 * Checks whether a given hostname is permitted under the domain allowlist.
 * Explicitly blocks private/LAN networks and cloud metadata IPs.
 */
export function isDomainAllowed(hostname: string, customAllowlist?: string[]): boolean {
  if (!hostname) return false
  const cleanHost = hostname.toLowerCase().trim()

  // Block private/LAN and cloud metadata IP ranges
  if (
    cleanHost === 'localhost' ||
    cleanHost === '127.0.0.1' ||
    cleanHost === '169.254.169.254' || // AWS/GCP/Azure instance metadata
    cleanHost.startsWith('10.') ||
    cleanHost.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanHost) ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal')
  ) {
    return false
  }

  const allowlist = customAllowlist || DEFAULT_ALLOWED_DOMAINS

  for (const allowed of allowlist) {
    if (cleanHost === allowed || cleanHost.endsWith(`.${allowed}`)) {
      return true
    }
  }

  return false
}

/**
 * Starts a local HTTP/CONNECT forward proxy enforcing domain allowlist.
 */
export async function startSandboxProxy(customAllowlist?: string[]): Promise<number> {
  if (activeProxyServer && activeProxyPort) {
    return activeProxyPort
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let hostname = ''
      let port = 80
      let pathname = '/'

      try {
        const parsedUrl = new URL(req.url || '', 'http://127.0.0.1')
        hostname = parsedUrl.hostname || (req.headers.host ? req.headers.host.split(':')[0] : '')
        port = parsedUrl.port ? Number(parsedUrl.port) : 80
        pathname = parsedUrl.pathname + parsedUrl.search
      } catch {
        hostname = req.headers.host ? req.headers.host.split(':')[0] : ''
      }

      if (!isDomainAllowed(hostname, customAllowlist)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end(`Blocked by SuperChat Sandbox Network Policy: Domain '${hostname}' is not in the allowlist.`)
        return
      }

      // Forward plain HTTP request
      const options: http.RequestOptions = {
        hostname,
        port,
        path: pathname,
        method: req.method,
        headers: req.headers,
      }

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
        proxyRes.pipe(res)
      })

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'text/plain' })
        res.end(`Proxy Error: ${err.message}`)
      })

      req.pipe(proxyReq)
    })

    // Handle HTTPS CONNECT tunneling
    server.on('connect', (req, clientSocket, head) => {
      const [hostname, portStr] = (req.url || '').split(':')
      const port = Number(portStr) || 443

      if (!isDomainAllowed(hostname, customAllowlist)) {
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        clientSocket.end()
        return
      }

      const serverSocket = net.connect(port, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        serverSocket.write(head)
        serverSocket.pipe(clientSocket)
        clientSocket.pipe(serverSocket)
      })

      serverSocket.on('error', () => {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
        clientSocket.end()
      })

      clientSocket.on('error', () => {
        serverSocket.end()
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = (addr as net.AddressInfo).port
      activeProxyServer = server
      activeProxyPort = port
      resolve(port)
    })

    server.on('error', reject)
  })
}

export function stopSandboxProxy(): void {
  if (activeProxyServer) {
    try {
      activeProxyServer.close()
    } catch {}
    activeProxyServer = null
    activeProxyPort = null
  }
}

/**
 * Returns environment variables needed to enforce network policy.
 */
export function getNetworkEnv(policy?: NetworkPolicy): Record<string, string> {
  const activePolicy: NetworkPolicy =
    policy || (process.env.SANDBOX_NETWORK as NetworkPolicy) || 'open'

  if (activePolicy === 'off') {
    // Break all outbound proxy resolution
    return {
      HTTP_PROXY: 'http://127.0.0.1:0',
      HTTPS_PROXY: 'http://127.0.0.1:0',
      http_proxy: 'http://127.0.0.1:0',
      https_proxy: 'http://127.0.0.1:0',
      ALL_PROXY: 'socks5://127.0.0.1:0',
      NO_PROXY: '',
      no_proxy: '',
    }
  }

  if (activePolicy === 'proxy' && activeProxyPort) {
    const proxyUrl = `http://127.0.0.1:${activeProxyPort}`
    return {
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
    }
  }

  return {}
}
