import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const publicOutput = path.join(ROOT, 'public', 'meta.jpg')
const previewFileUrl = new URL(`file://${path.join(ROOT, 'public', 'og-preview.html')}`)

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function captureOgImage() {
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1200,
        height: 630
      },
      deviceScaleFactor: 1
    })

    await page.goto(previewFileUrl.href, {
      waitUntil: 'networkidle'
    })

    await mkdir(path.dirname(publicOutput), {
      recursive: true
    })

    await page.screenshot({
      path: publicOutput,
      type: 'jpeg',
      quality: 92
    })
  } finally {
    await browser.close()
  }
}

async function main() {
  await captureOgImage()
  await runCommand(npmCmd, ['run', 'build'])
  console.log(`Open graph image generated at ${publicOutput}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
