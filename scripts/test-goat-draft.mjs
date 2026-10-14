/**
 * Integration test for DUNKEST GOAT DRAFT
 * Run: node scripts/test-goat-draft.mjs
 *
 * Requires: dev server running on localhost:58560 + .env.local
 * Creates 8 test users, runs full draft flow, then cleans up.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Load env ──────────────────────────────────────────────────────────────────

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.local'), 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
)

const SUPABASE_URL  = env['NEXT_PUBLIC_SUPABASE_URL']
const ANON_KEY      = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const SERVICE_KEY   = env['SUPABASE_SERVICE_ROLE_KEY']
const BASE_URL      = 'http://localhost:58560'

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Missing env vars'); process.exit(1)
}

// Extract project ref from URL: https://<ref>.supabase.co
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] ?? ''
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Cookie helper ─────────────────────────────────────────────────────────────
// @supabase/ssr v0.12.x (chunker.js) stores the session as plain JSON,
// split along URI-safe boundaries into MAX_CHUNK_SIZE=3180 encoded-byte chunks.
// Single chunk: COOKIE_NAME=<json>
// Multi-chunk:  COOKIE_NAME.0=<chunk0>; COOKIE_NAME.1=<chunk1>; …

function sessionToCookies(session) {
  const raw = JSON.stringify(session)
  const MAX_CHUNK = 3180
  let encodedValue = encodeURIComponent(raw)

  if (encodedValue.length <= MAX_CHUNK) {
    return `${COOKIE_NAME}=${raw}`
  }

  // Replicate createChunks() from @supabase/ssr/utils/chunker.js
  const chunks = []
  while (encodedValue.length > 0) {
    let head = encodedValue.slice(0, MAX_CHUNK)
    const lastEscape = head.lastIndexOf('%')
    if (lastEscape > MAX_CHUNK - 3) head = head.slice(0, lastEscape)
    let valueHead = ''
    while (head.length > 0) {
      try { valueHead = decodeURIComponent(head); break }
      catch { head = head.slice(0, head.length - 3) }
    }
    chunks.push(valueHead)
    encodedValue = encodedValue.slice(encodeURIComponent(valueHead).length)
  }
  return chunks.map((c, i) => `${COOKIE_NAME}.${i}=${c}`).join('; ')
}

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  return sessionToCookies(data.session)
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function api(method, path, body, cookieStr) {
  const headers = { 'Content-Type': 'application/json' }
  if (cookieStr) headers['Cookie'] = cookieStr
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0
const createdUserIds = []
let sessionId = null

const ok   = label        => { console.log(`  ✓  ${label}`); passed++ }
const fail = (label, det) => { console.error(`  ✗  ${label}`, det ?? ''); failed++ }
const assert = (cond, label, det) => cond ? ok(label) : fail(label, det)

// ── Pre-cleanup: remove leftover test users from previous runs ────────────────

const TEST_EMAILS = [
  'test-admin@goatdraft.test',
  ...Array.from({ length: 7 }, (_, i) => `test-gm${i + 1}@goatdraft.test`),
]

async function preCleanup() {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  for (const email of TEST_EMAILS) {
    const user = (data?.users ?? []).find(u => u.email === email)
    if (user) {
      await supabaseAdmin.from('dunkest_draft_access').delete().eq('user_id', user.id)
      await supabaseAdmin.auth.admin.deleteUser(user.id)
    }
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function createTestUsers() {
  console.log('\n── Creating test users ──────────────────────────────────────')
  const specs = [
    { email: 'test-admin@goatdraft.test', password: 'TestAdmin123!', role: 'admin', name: 'Test Admin' },
    ...Array.from({ length: 7 }, (_, i) => ({
      email: `test-gm${i + 1}@goatdraft.test`,
      password: `TestGM${i + 1}Pass!`,
      role: 'gm',
      name: `GM Test ${i + 1}`,
    })),
  ]

  const users = []
  for (const spec of specs) {
    let userId
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
    })
    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        // User exists from a previous run — reuse it
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
        const existing = listData?.users.find(u => u.email === spec.email)
        if (!existing) { fail(`Create/find user ${spec.email}`, error.message); continue }
        userId = existing.id
        await supabaseAdmin.auth.admin.updateUserById(userId, { password: spec.password, email_confirm: true })
      } else {
        fail(`Create user ${spec.email}`, error.message)
        continue
      }
    } else {
      userId = data.user.id
    }

    const id = userId
    createdUserIds.push(id)

    const { error: pErr } = await supabaseAdmin
      .from('profiles')
      .update({ role: spec.role, display_name: spec.name })
      .eq('id', id)
    if (pErr) { fail(`Set profile ${spec.email}`, pErr.message); continue }

    ok(`Created ${spec.role}: ${spec.name}`)
    users.push({ ...spec, id })
  }
  return users
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function runTests(users) {
  const admin = users.find(u => u.role === 'admin')
  const gms   = users.filter(u => u.role === 'gm')

  // Sign in all users → get cookie strings
  console.log('\n── Sign in ──────────────────────────────────────────────────')
  const adminCookie = await signIn(admin.email, admin.password)
  ok('Admin signed in')
  const gmCookies = []
  for (const gm of gms) gmCookies.push(await signIn(gm.email, gm.password))
  ok(`${gms.length} GMs signed in`)

  // ── 1. Auth guard ──────────────────────────────────────────────────────────
  console.log('\n── 1. Auth guard ────────────────────────────────────────────')
  const { status: s1 } = await api('GET', '/api/goat-draft')
  assert(s1 === 401 || s1 === 307, 'Unauthenticated → 401 or redirect')

  // ── 2. Access status ───────────────────────────────────────────────────────
  console.log('\n── 2. Access status ─────────────────────────────────────────')
  const { json: j2 } = await api('GET', '/api/goat-draft/access', null, gmCookies[0])
  assert(j2?.status === 'none', `New GM has no access (got: ${j2?.status})`)

  const { json: j2a } = await api('GET', '/api/goat-draft/access', null, adminCookie)
  assert(j2a?.status === 'approved' && j2a?.isAdmin === true, 'Admin is auto-approved')

  // ── 3. GMs request access ──────────────────────────────────────────────────
  console.log('\n── 3. Access requests ───────────────────────────────────────')
  for (let i = 0; i < 7; i++) {
    const { status, json } = await api('POST', '/api/goat-draft/access', null, gmCookies[i])
    assert(status === 200 && json?.success, `GM${i + 1} requests access`)
  }
  const { status: dupStatus } = await api('POST', '/api/goat-draft/access', null, gmCookies[0])
  assert(dupStatus === 409, 'Duplicate request → 409')

  const { json: j3 } = await api('GET', '/api/goat-draft/access', null, gmCookies[0])
  assert(j3?.status === 'pending', 'GM status is pending after request')

  // ── 4. Admin sees requests ─────────────────────────────────────────────────
  console.log('\n── 4. Admin views requests ──────────────────────────────────')
  const { json: j4 } = await api('GET', '/api/admin/goat-draft-access', null, adminCookie)
  const testGmIds = new Set(gms.map(g => g.id))
  const testRequests = (j4?.requests ?? []).filter(r => testGmIds.has(r.user_id))
  assert(testRequests.length === 7, `Admin sees 7 test requests (got ${testRequests.length} of ${j4?.requests?.length} total)`)

  const { status: s4b } = await api('GET', '/api/admin/goat-draft-access', null, gmCookies[0])
  assert(s4b === 403, 'Non-admin → 403')

  // ── 5. Admin approves all ──────────────────────────────────────────────────
  console.log('\n── 5. Admin approves all ────────────────────────────────────')
  for (const r of testRequests) {
    const { json } = await api('PATCH', '/api/admin/goat-draft-access', { id: r.id, action: 'approve' }, adminCookie)
    assert(json?.success, `Approved ${r.display_name ?? r.email}`)
  }
  const { json: j5 } = await api('GET', '/api/goat-draft/access', null, gmCookies[0])
  assert(j5?.status === 'approved', 'GM1 is now approved')

  // ── 6. Authorization on session creation ───────────────────────────────────
  console.log('\n── 6. Session creation auth ─────────────────────────────────')
  const gmIds = gms.map(g => g.id)

  const { status: s6a } = await api('POST', '/api/goat-draft', { name: 'X', otherUserIds: gmIds }, gmCookies[0])
  assert(s6a === 403, 'GM cannot create session → 403')

  const { status: s6b } = await api('POST', '/api/goat-draft', { name: 'X', otherUserIds: gmIds.slice(0, 6) }, adminCookie)
  assert(s6b === 400, '6 others → 400')

  const { status: s6c } = await api('POST', '/api/goat-draft', { name: 'X', otherUserIds: [admin.id, ...gmIds.slice(0, 6)] }, adminCookie)
  assert(s6c === 400, 'Admin in list → 400')

  // ── 7. Create session ──────────────────────────────────────────────────────
  console.log('\n── 7. Create session ────────────────────────────────────────')
  const { status: s7, json: j7 } = await api('POST', '/api/goat-draft', { name: 'Test Draft', otherUserIds: gmIds }, adminCookie)
  assert(s7 === 200 && j7?.id, `Session created: ${j7?.id?.slice(0, 8)}`)
  sessionId = j7.id

  // ── 8. Session state ───────────────────────────────────────────────────────
  console.log('\n── 8. Session state ─────────────────────────────────────────')
  const { json: st1 } = await api('GET', `/api/goat-draft/${sessionId}`, null, adminCookie)
  assert(st1?.session?.status === 'setup', 'Status is setup')
  assert(st1?.participants?.length === 8, '8 participants')
  assert(st1?.session?.initial_order?.length === 8, 'Initial order has 8 entries')
  assert(st1?.session?.current_pick_index === 0, 'Pick index starts at 0')

  const roundOrder = st1.session.current_round_order  // array of participant IDs

  // ── 9. Pick before start → blocked ────────────────────────────────────────
  console.log('\n── 9. Pick before start ─────────────────────────────────────')
  const { json: cat0 } = await api('GET', `/api/goat-draft/${sessionId}/catalog`, null, adminCookie)
  assert(cat0?.players?.length > 0, `Catalog has ${cat0?.players?.length} players`)

  const firstPid = roundOrder[0]
  const firstP   = st1.participants.find(p => p.id === firstPid)
  const firstCookie = firstP.user_id === admin.id ? adminCookie : gmCookies[gms.findIndex(g => g.id === firstP.user_id)]

  const { status: s9 } = await api('POST', `/api/goat-draft/${sessionId}/pick`,
    { participantId: firstPid, dunkestPlayerId: cat0.players[0].id }, firstCookie)
  assert(s9 === 400, 'Pick before start → 400')

  // ── 10. Start draft ────────────────────────────────────────────────────────
  console.log('\n── 10. Start draft ──────────────────────────────────────────')
  const { status: s10, json: j10 } = await api('POST', `/api/goat-draft/${sessionId}/start`, null, adminCookie)
  assert(s10 === 200 && j10?.success, 'Admin starts draft')

  const { json: st2 } = await api('GET', `/api/goat-draft/${sessionId}`, null, adminCookie)
  assert(st2?.session?.status === 'active', 'Status is active')

  // Build cookie-per-participant map
  const allParticipants = st2.participants
  const cookieFor = (pid) => {
    const p = allParticipants.find(x => x.id === pid)
    if (!p) return null
    if (p.user_id === admin.id) return adminCookie
    const idx = gms.findIndex(g => g.id === p.user_id)
    return idx >= 0 ? gmCookies[idx] : null
  }

  // ── 11. Out-of-turn pick ───────────────────────────────────────────────────
  console.log('\n── 11. Out-of-turn pick ─────────────────────────────────────')
  const secondPid    = roundOrder[1]
  const secondCookie = cookieFor(secondPid)

  const { status: s11, json: j11 } = await api('POST', `/api/goat-draft/${sessionId}/pick`,
    { participantId: secondPid, dunkestPlayerId: cat0.players[0].id }, secondCookie)
  assert(s11 === 400, `Out-of-turn → 400 ("${j11?.error}")`)

  // ── 12. Wrong user for current participant ─────────────────────────────────
  console.log('\n── 12. Wrong user ───────────────────────────────────────────')
  const { status: s12 } = await api('POST', `/api/goat-draft/${sessionId}/pick`,
    { participantId: firstPid, dunkestPlayerId: cat0.players[0].id }, secondCookie)
  assert(s12 === 400, 'Wrong user for participant → 400')

  // ── 13. Full round 1 ──────────────────────────────────────────────────────
  console.log('\n── 13. Round 1 — 8 picks ────────────────────────────────────')
  for (let i = 0; i < 8; i++) {
    const pid    = roundOrder[i]
    const cookie = cookieFor(pid)
    const { json: cat } = await api('GET', `/api/goat-draft/${sessionId}/catalog`, null, cookie)
    const player = cat.players[0]
    const { status, json } = await api('POST', `/api/goat-draft/${sessionId}/pick`,
      { participantId: pid, dunkestPlayerId: player.id }, cookie)
    assert(status === 200, `R1 pick ${i + 1}/8: ${player.name} (${player.value})`)
    if (i === 7) assert(json?.roundAdvanced === true, 'Last pick advances round')
  }

  // ── 14. Round transition ───────────────────────────────────────────────────
  console.log('\n── 14. Round transition ─────────────────────────────────────')
  const { json: st3 } = await api('GET', `/api/goat-draft/${sessionId}`, null, adminCookie)
  assert(st3?.session?.current_round === 2, 'Now round 2')
  assert(st3?.session?.current_pick_index === 0, 'Pick index reset to 0')
  assert(st3?.picks?.length === 8, '8 picks in history')

  // New order must be sorted by roster_value ascending
  const r2Order  = st3.session.current_round_order
  const parts3   = st3.participants
  const byValue  = [...parts3].sort((a, b) => {
    if (a.roster_value !== b.roster_value) return a.roster_value - b.roster_value
    return st3.session.current_round_order.indexOf(a.id) - st3.session.current_round_order.indexOf(b.id)
  })
  // Note: r2Order is the NEW order, byValue is also the new order we expect
  const lowestValueParticipant = [...parts3].sort((a, b) => a.roster_value - b.roster_value)[0]
  assert(r2Order[0] === lowestValueParticipant.id,
    `R2 first is lowest-value: ${lowestValueParticipant.display_name} (${lowestValueParticipant.roster_value})`)

  // ── 15. Duplicate player rejected ─────────────────────────────────────────
  console.log('\n── 15. Duplicate player ─────────────────────────────────────')
  const alreadyPicked = st3.picks[0].dunkest_player_id
  const r2FirstPid    = r2Order[0]
  const r2FirstCookie = cookieFor(r2FirstPid)

  const { status: s15 } = await api('POST', `/api/goat-draft/${sessionId}/pick`,
    { participantId: r2FirstPid, dunkestPlayerId: alreadyPicked }, r2FirstCookie)
  assert(s15 === 400, 'Already-picked player → 400')

  // ── 16. Valid R2 pick, then double-pick blocked ────────────────────────────
  console.log('\n── 16. Double pick in round ─────────────────────────────────')
  const { json: cat3 } = await api('GET', `/api/goat-draft/${sessionId}/catalog`, null, r2FirstCookie)
  const r2p1 = cat3.players[0]
  const { status: s16a } = await api('POST', `/api/goat-draft/${sessionId}/pick`,
    { participantId: r2FirstPid, dunkestPlayerId: r2p1.id }, r2FirstCookie)
  assert(s16a === 200, 'R2 pick 1 succeeds')

  const { json: cat3b } = await api('GET', `/api/goat-draft/${sessionId}/catalog`, null, r2FirstCookie)
  const { status: s16b } = await api('POST', `/api/goat-draft/${sessionId}/pick`,
    { participantId: r2FirstPid, dunkestPlayerId: cat3b.players[0].id }, r2FirstCookie)
  assert(s16b === 400, 'Same participant picks twice in round → 400')

  // ── 17. Catalog shrinks ────────────────────────────────────────────────────
  console.log('\n── 17. Catalog shrinks ──────────────────────────────────────')
  const { json: catFinal } = await api('GET', `/api/goat-draft/${sessionId}/catalog`, null, adminCookie)
  const pickedSoFar = 9  // 8 from R1 + 1 from R2
  assert(catFinal.players.length === 599 - pickedSoFar,
    `Catalog has ${catFinal.players.length} players (expected ${599 - pickedSoFar})`)

  // ── 18. Value ranking reflects actual picks ────────────────────────────────
  console.log('\n── 18. Value ranking ────────────────────────────────────────')
  const { json: st4 } = await api('GET', `/api/goat-draft/${sessionId}`, null, adminCookie)
  const r2ParticipantWithPick = st4.participants.find(p => p.id === r2FirstPid)
  assert(r2ParticipantWithPick?.roster_value > 0, `R2 first picker has roster value ${r2ParticipantWithPick?.roster_value}`)

  // ── 19. Session visible in list ────────────────────────────────────────────
  console.log('\n── 19. Session list ─────────────────────────────────────────')
  const { json: list } = await api('GET', '/api/goat-draft', null, gmCookies[0])
  assert(list?.sessions?.some(s => s.id === sessionId), 'Session in list for approved GM')
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n── Cleanup ──────────────────────────────────────────────────')
  if (sessionId) {
    await supabaseAdmin.from('goat_draft_picks').delete().eq('session_id', sessionId)
    await supabaseAdmin.from('goat_draft_participants').delete().eq('session_id', sessionId)
    await supabaseAdmin.from('goat_draft_sessions').delete().eq('id', sessionId)
    ok('Deleted test session and picks')
  }
  if (createdUserIds.length > 0) {
    await supabaseAdmin.from('dunkest_draft_access').delete().in('user_id', createdUserIds)
    for (const id of createdUserIds) await supabaseAdmin.auth.admin.deleteUser(id)
    ok(`Deleted ${createdUserIds.length} test users`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   DUNKEST GOAT DRAFT — Integration Tests    ║')
  console.log('╚══════════════════════════════════════════════╝')

  try { await fetch(`${BASE_URL}/api/goat-draft`) }
  catch { console.error(`\nServer non raggiungibile su ${BASE_URL}. Avvia con: npm run dev\n`); process.exit(1) }

  await preCleanup()

  let users = []
  try {
    users = await createTestUsers()
    if (users.length < 8) throw new Error('Non tutti gli utenti sono stati creati')
    await runTests(users)
  } catch (e) {
    fail('Uncaught error', e.message)
    console.error(e)
  } finally {
    await cleanup()
  }

  console.log('\n══════════════════════════════════════════════')
  console.log(`  Passed: ${passed}   Failed: ${failed}`)
  console.log('══════════════════════════════════════════════\n')
  if (failed > 0) process.exit(1)
}

main()
