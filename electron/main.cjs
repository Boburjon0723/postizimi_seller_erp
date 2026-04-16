const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { URL } = require('url')

let mainWindow = null
let staticServer = null

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.ico') return 'image/x-icon'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.woff2') return 'font/woff2'
  if (ext === '.woff') return 'font/woff'
  if (ext === '.ttf') return 'font/ttf'
  return 'text/html; charset=utf-8'
}

function createStaticServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const rawUrl = req.url || '/'
        const parsed = new URL(rawUrl, 'http://127.0.0.1')
        let reqPath = decodeURIComponent(parsed.pathname || '/')
        if (reqPath.endsWith('/')) reqPath += 'index.html'

        let filePath = path.join(distDir, reqPath.replace(/^\/+/, ''))
        const normalizedDist = path.normalize(distDir + path.sep)
        const normalizedFile = path.normalize(filePath)

        if (!normalizedFile.startsWith(normalizedDist)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html')
        }

        const data = fs.readFileSync(filePath)
        res.writeHead(200, { 'Content-Type': contentType(filePath) })
        res.end(data)
      } catch {
        try {
          const fallback = fs.readFileSync(path.join(distDir, 'index.html'))
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(fallback)
        } catch {
          res.writeHead(500)
          res.end('Internal server error')
        }
      }
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve(server)
    })
  })
}

function getDevUrl() {
  const arg = process.argv.find((x) => x.startsWith('--dev-url='))
  if (!arg) return ''
  return arg.slice('--dev-url='.length).trim()
}

async function createMainWindow() {
  const winIcon = path.join(__dirname, '..', 'build', 'icon.ico')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#f9f7f0',
    icon: fs.existsSync(winIcon) ? winIcon : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devUrl = getDevUrl()
  if (devUrl) {
    await mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  const distDir = path.join(__dirname, '..', 'dist')
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    await mainWindow.loadURL('data:text/html;charset=utf-8,Build topilmadi. Avval npm run build bajaring.')
    return
  }

  staticServer = await createStaticServer(distDir)
  const addr = staticServer.address()
  const port = addr && typeof addr === 'object' ? addr.port : 0
  await mainWindow.loadURL(`http://127.0.0.1:${port}`)
}

app.whenReady().then(createMainWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (staticServer) {
    try {
      staticServer.close()
    } catch {
      // ignore close errors
    }
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})
