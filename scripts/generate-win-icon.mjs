import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = process.cwd()
const svgPath = path.join(root, 'public', 'favicon.svg')
const buildDir = path.join(root, 'build')
const tempDir = path.join(buildDir, 'icon-src')
const iconIcoPath = path.join(buildDir, 'icon.ico')

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function main() {
  await ensureDir(tempDir)
  const sizes = [256, 128, 64, 48, 32, 16]
  const pngPaths = []

  for (const size of sizes) {
    const out = path.join(tempDir, `icon-${size}.png`)
    await sharp(svgPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out)
    pngPaths.push(out)
  }

  const ico = await pngToIco(pngPaths)
  await fs.writeFile(iconIcoPath, ico)
  process.stdout.write(`Windows icon generated: ${path.relative(root, iconIcoPath)}\n`)
}

main().catch((err) => {
  process.stderr.write(`Icon generation failed: ${err?.message || err}\n`)
  process.exit(1)
})
