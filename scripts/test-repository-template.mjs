import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const ts = require('typescript')

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const helperPath = resolve(rootDir, 'src/renderer/src/repositoryTemplate.ts')

assert.ok(existsSync(helperPath), 'repository template helper module should exist')

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

const { buildRepositoryRunShellCommand } = helperModule.exports

assert.equal(typeof buildRepositoryRunShellCommand, 'function')
assert.equal(
  buildRepositoryRunShellCommand('/Users/example/Linked Project', 'exec npm run dev'),
  "cd '/Users/example/Linked Project' && exec npm run dev"
)
assert.equal(
  buildRepositoryRunShellCommand("/Users/example/client's app", ' exec pnpm start '),
  "cd '/Users/example/client'\\''s app' && exec pnpm start"
)
assert.equal(
  buildRepositoryRunShellCommand('/Users/example/app', ''),
  'cd /Users/example/app && echo "Set the repository run command before starting this service."'
)

console.log('repository template helper tests passed')
