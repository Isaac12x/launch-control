import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

const ghosttyCandidates = [
  () => '/Applications/Programming/Ghostty.app',
  () => '/Applications/Ghostty.app'
]

async function ensureExtractedGhostty(): Promise<string> {
  const zipPath = join(process.resourcesPath, 'Ghostty.zip')
  const extractionDirectory = join(app.getPath('userData'), 'ghostty-runtime')
  const appPath = join(extractionDirectory, 'Ghostty.app')

  await mkdir(extractionDirectory, { recursive: true })

  const [zipStats, extractedStats] = await Promise.all([
    stat(zipPath),
    stat(appPath).catch(() => null)
  ])

  if (!extractedStats || extractedStats.mtimeMs < zipStats.mtimeMs) {
    await execFileAsync('/usr/bin/ditto', ['-x', '-k', zipPath, extractionDirectory])
  }

  return appPath
}

export async function resolveGhosttyApp(): Promise<string> {
  if (app.isPackaged) {
    const packagedPath = await ensureExtractedGhostty()
    await access(packagedPath, constants.R_OK)
    return packagedPath
  }

  for (const candidate of ghosttyCandidates) {
    const appPath = candidate()

    try {
      await access(appPath, constants.R_OK)
      return appPath
    } catch {
      continue
    }
  }

  throw new Error(
    'Ghostty.app is not available. Install Ghostty or set GHOSTTY_APP_PATH before packaging.'
  )
}
