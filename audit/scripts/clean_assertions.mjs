#!/usr/bin/env node
/**
 * clean_assertions.mjs
 * StreamVault AI Red Team Audit — upgraded assertion cleaner.
 *
 * Usage:
 *   node clean_assertions.mjs <redteam.yaml> <local_grader.mjs> [--dry-run]
 */

import fs   from 'fs'
import path from 'path'
import { parseDocument, stringify } from 'yaml'

// Assertion types that require Promptfoo cloud / remote LLM grading
const REMOTE_TYPES = new Set([
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'similar',
  'classifier',
  'webhook',
])

const REMOTE_VALUE_SUBSTRINGS = [
  'promptfoo.app',
  'api.promptfoo',
  'redteam-grader',
]

function isRemoteAssertion(assertion) {
  if (!assertion || typeof assertion !== 'object') return false
  if (REMOTE_TYPES.has(assertion.type)) return true
  if (typeof assertion.value === 'string') {
    return REMOTE_VALUE_SUBSTRINGS.some(s => assertion.value.includes(s))
  }
  return false
}

function isLocalGraderAssertion(assertion, graderPath) {
  return (
    assertion?.type === 'javascript' &&
    typeof assertion?.value === 'string' &&
    assertion.value.includes(path.basename(graderPath))
  )
}

function cleanAssertions(assertions, graderAbsPath) {
  if (!Array.isArray(assertions)) return { cleaned: [], removedCount: 0 }

  const kept    = assertions.filter(a => !isRemoteAssertion(a))
  const removed = assertions.length - kept.length

  // Remove any existing local grader entries (dedup), then add one fresh
  const withoutGrader = kept.filter(a => !isLocalGraderAssertion(a, graderAbsPath))
  withoutGrader.push({
    type:  'javascript',
    value: `file://${graderAbsPath}`,
  })

  return { cleaned: withoutGrader, removedCount: removed }
}

function main() {
  const args   = process.argv.slice(2).filter(a => a !== '--dry-run')
  const dryRun = process.argv.includes('--dry-run')

  if (args.length < 2) {
    console.error('Usage: node clean_assertions.mjs <redteam.yaml> <local_grader.mjs> [--dry-run]')
    process.exit(1)
  }

  const [yamlPath, graderPath] = args
  const graderAbs = path.resolve(graderPath)
  const yamlAbs   = path.resolve(yamlPath)

  if (!fs.existsSync(yamlAbs))   { console.error(`Error: YAML not found: ${yamlAbs}`);   process.exit(1) }
  if (!fs.existsSync(graderAbs)) { console.error(`Error: Grader not found: ${graderAbs}`); process.exit(1) }

  const raw  = fs.readFileSync(yamlAbs, 'utf8')
  const doc  = parseDocument(raw)
  const data = doc.toJSON()

  let totalRemoved = 0

  // defaultTest.assert
  if (data.defaultTest?.assert) {
    const { cleaned, removedCount } = cleanAssertions(data.defaultTest.assert, graderAbs)
    data.defaultTest.assert = cleaned
    totalRemoved += removedCount
  } else {
    data.defaultTest = data.defaultTest ?? {}
    data.defaultTest.assert = [{ type: 'javascript', value: `file://${graderAbs}` }]
  }

  // Per-test assert arrays
  let testCount = 0
  if (Array.isArray(data.tests)) {
    for (const test of data.tests) {
      if (!Array.isArray(test.assert)) continue
      const { cleaned, removedCount } = cleanAssertions(test.assert, graderAbs)
      test.assert   = cleaned
      totalRemoved += removedCount
      testCount++
    }
  }

  console.log(`clean_assertions: removed ${totalRemoved} remote assertion(s) across defaultTest + ${testCount} test(s).`)
  console.log(`clean_assertions: local grader → file://${graderAbs}`)

  if (dryRun) {
    console.log('Dry-run mode: no files written.')
    return
  }

  const backupPath = `${yamlAbs}.bak`
  fs.copyFileSync(yamlAbs, backupPath)
  console.log(`clean_assertions: backup saved → ${backupPath}`)

  fs.writeFileSync(yamlAbs, stringify(data), 'utf8')
  console.log(`clean_assertions: wrote cleaned YAML → ${yamlAbs}`)
}

main()
