/**
 * Import ARCHIVIO DUNKEST.xlsx into the dunkest_players table.
 * Run: node scripts/import-dunkest.mjs
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * The source XLSX file is never modified.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Load .env.local manually (same pattern as other scripts)
const envPath = resolve(ROOT, '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')])
)

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const XLSX_PATH = resolve(ROOT, 'ARCHIVIO DUNKEST.xlsx')

async function main() {
  // Read XLSX — source file is not modified
  const wb = XLSX.readFile(XLSX_PATH)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // raw[0] = ['name', 'Team', 'role', 'value']
  const rows = raw.slice(1)
  console.log(`Read ${rows.length} rows from XLSX`)

  // Parse and validate rows
  const players = []
  const skipped = []
  for (let i = 0; i < rows.length; i++) {
    const [name, team, role, valueRaw] = rows[i]
    if (!name || !team || !role || valueRaw === undefined || valueRaw === '') {
      skipped.push({ xlsxRow: i + 2, reason: 'missing field', data: rows[i] })
      continue
    }
    // value uses comma as decimal separator in the source file
    const value = parseFloat(String(valueRaw).replace(',', '.'))
    if (isNaN(value)) {
      skipped.push({ xlsxRow: i + 2, reason: 'invalid value', data: rows[i] })
      continue
    }
    players.push({
      name: String(name).trim(),
      team: String(team).trim(),
      role: String(role).trim(),
      value,
    })
  }

  if (skipped.length > 0) {
    console.warn(`⚠ Skipped ${skipped.length} malformed rows:`)
    skipped.forEach(s => console.warn(`  Row ${s.xlsxRow}: ${s.reason} —`, s.data))
  }

  console.log(`Parsed ${players.length} valid players`)

  // Check existing rows
  const { count } = await supabase
    .from('dunkest_players')
    .select('*', { count: 'exact', head: true })

  if (count && count > 0) {
    console.log(`Table has ${count} existing rows. Deleting before re-import...`)
    const { error: delErr } = await supabase
      .from('dunkest_players')
      .delete()
      .gte('id', 0)
    if (delErr) {
      console.error('Failed to clear table:', delErr)
      process.exit(1)
    }
  }

  // Batch insert (Supabase handles up to ~1000 rows per call)
  const BATCH_SIZE = 500
  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('dunkest_players').insert(batch)
    if (error) {
      console.error(`Batch insert error (rows ${i + 1}–${i + batch.length}):`, error)
      process.exit(1)
    }
    console.log(`  Inserted rows ${i + 1}–${i + batch.length}`)
  }

  console.log(`✓ Done. ${players.length} players imported into dunkest_players.`)
}

main().catch(e => { console.error(e); process.exit(1) })
