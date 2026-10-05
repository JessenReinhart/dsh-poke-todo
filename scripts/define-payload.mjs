#!/usr/bin/env node
/*
 * Emit the exact cordis_define payload for this plugin.
 *
 * plugin/host.js and plugin/client.js are plain JavaScript *function bodies*,
 * not modules: their entire file contents become the code.host / code.client
 * string values. This script reads both files and prints valid JSON so the
 * payload can be copy-pasted, piped, or diffed.
 *
 * Usage: node scripts/define-payload.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const payload = {
  plugin: { kind: 'new', idPrefix: 'poke' },
  name: 'jcode poke todo',
  purpose: 'Nudge an idle agent to continue working when its session has incomplete todos.',
  code: {
    host: read('plugin/host.js'),
    client: read('plugin/client.js'),
  },
}

process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
