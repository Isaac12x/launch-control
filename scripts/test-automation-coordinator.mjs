import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const ts = require('typescript')

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const helperPath = resolve(rootDir, 'src/main/automation.ts')

assert.ok(existsSync(helperPath), 'automation coordinator module should exist')

const source = readFileSync(helperPath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  },
  fileName: helperPath
})
const helperModule = new Module(helperPath)
helperModule.filename = helperPath
helperModule.paths = Module._nodeModulePaths(dirname(helperPath))
helperModule._compile(compiled.outputText, helperPath)

const { startAutomationCoordinator } = helperModule.exports

assert.equal(typeof startAutomationCoordinator, 'function')

function createService(overrides = {}) {
  return {
    label: 'com.example.agent',
    name: 'Example Agent',
    enabled: true,
    loaded: true,
    running: false,
    completed: false,
    automation: {
      startCondition: null,
      automaticStartTimes: [],
      startOnLaunch: false,
      launchDelaySeconds: 0,
      ensureRunning: false,
      critical: true
    },
    ...overrides
  }
}

let refreshIndex = 0
const refreshSnapshots = [
  [createService({ running: true })],
  [createService({ running: false })],
  [createService({ running: false })]
]
const criticalDownEvents = []
const coordinator = startAutomationCoordinator({
  refreshServices: async () => refreshSnapshots[Math.min(refreshIndex++, refreshSnapshots.length - 1)],
  startService: async () => {
    throw new Error('critical notification test should not auto-start services')
  },
  notifyCriticalServiceDown: async (service) => {
    criticalDownEvents.push(service)
  }
})

try {
  await coordinator.runNow()
  assert.equal(criticalDownEvents.length, 0)

  await coordinator.runNow()
  assert.equal(criticalDownEvents.length, 1)
  assert.equal(criticalDownEvents[0].label, 'com.example.agent')

  await coordinator.runNow()
  assert.equal(criticalDownEvents.length, 1)
} finally {
  coordinator.dispose()
}

console.log('automation coordinator tests passed')
