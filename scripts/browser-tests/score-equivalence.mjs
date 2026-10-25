// Confronta lo score del server (/api/players/scored) con scorePlayer calcolato lato client
// sugli stessi dati (draft-list + contracts + potentials), per gli stessi pesi.
import { scorePlayer } from '../../lib/nba/playerScorer.ts'
import { matchContract } from '../../lib/nba/matchContract.ts'
const base = process.argv[2]
const weights = { rebuild: 3, winNow: 5, valueHunt: 2, teamFriendly: 1, physicalFreak: 4, capRelief: 0 }
const [list, contracts, server] = await Promise.all([
  fetch(base + '/api/players/draft-list').then(r => r.json()),
  fetch(base + '/api/contracts').then(r => r.json()),
  fetch(base + '/api/players/scored', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weights }) }).then(r => r.json()),
])
const slugs = list.data.map(p => p.slug)
const pots = {}
for (let i = 0; i < slugs.length; i += 50) Object.assign(pots, await fetch(base + '/api/players/potentials?slugs=' + slugs.slice(i, i + 50).join(',')).then(r => r.json()))
let mismatches = 0
for (const s of server.data) {
  const p = list.data.find(x => x.slug === s.slug)
  const client = scorePlayer(p, pots[s.slug], contracts.data.length ? matchContract(p.name, contracts.data) : undefined, weights).total
  if (client !== s.score.total) { mismatches++; if (mismatches <= 5) console.log('DIFF', s.name, 'client', client, 'server', s.score.total) }
}
console.log(JSON.stringify({ checked: server.data.length, mismatches }))
