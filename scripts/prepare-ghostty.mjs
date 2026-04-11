import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const source =
  process.env.GHOSTTY_APP_PATH ||
  '/Applications/Programming/Ghostty.app'

const vendorDirectory = resolve(process.cwd(), 'vendor')
const destination = resolve(vendorDirectory, 'Ghostty.zip')

rmSync(resolve(vendorDirectory, 'Ghostty.app'), { recursive: true, force: true })
rmSync(destination, { force: true })
mkdirSync(vendorDirectory, { recursive: true })

if (!existsSync(source)) {
  console.warn(
    `[prepare:ghostty] Ghostty was not found at ${source}. Packaging will fail until the app is installed or GHOSTTY_APP_PATH is set.`
  )
  process.exit(0)
}

const result = spawnSync(
  '/usr/bin/ditto',
  ['-c', '-k', '--sequesterRsrc', '--keepParent', source, destination],
  {
    stdio: 'inherit'
  }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log(`[prepare:ghostty] Archived Ghostty from ${source}`)
