import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const ts = require('typescript')

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const helperPath = resolve(rootDir, 'src/renderer/src/liveRuntime.ts')

assert.ok(existsSync(helperPath), 'live runtime helper module should exist')

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

const { getTreeServiceDisplayState, mergeLiveRuntimeServices } = helperModule.exports

assert.equal(typeof mergeLiveRuntimeServices, 'function')
assert.equal(typeof getTreeServiceDisplayState, 'function')

const baseService = {
  label: 'com.example.agent',
  enabled: true,
  loaded: true,
  running: false,
  completed: false,
  pid: null,
  lastExitStatus: 0,
  status: 'loaded',
  load: { sampledAt: 'old' }
}

const runningService = {
  ...baseService,
  running: true,
  pid: 1234,
  status: 'running',
  load: { sampledAt: 'new' }
}

const changedResult = mergeLiveRuntimeServices([baseService], [runningService])

assert.equal(changedResult.changed, true)
assert.equal(changedResult.services[0].running, true)
assert.equal(changedResult.services[0].pid, 1234)
assert.equal(changedResult.services[0].status, 'running')
assert.equal(changedResult.services[0].load.sampledAt, 'old')

const unchangedResult = mergeLiveRuntimeServices(changedResult.services, [
  {
    ...changedResult.services[0],
    load: { sampledAt: 'newer' }
  }
])

assert.equal(unchangedResult.changed, false)
assert.equal(unchangedResult.services, changedResult.services)

assert.deepEqual(
  getTreeServiceDisplayState(runningService, {
    tone: 'progress',
    message: 'Restarting...'
  }),
  {
    statusClass: 'progress',
    label: 'Restarting...'
  }
)
assert.deepEqual(getTreeServiceDisplayState(runningService, null), {
  statusClass: 'running',
  label: 'running'
})

console.log('live runtime helper tests passed')
