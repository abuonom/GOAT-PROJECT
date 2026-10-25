interface TeamEntry { espn: string; abbr: string }

const TEAMS: Record<string, TeamEntry> = {
  'Atlanta Hawks':          { espn: 'atl',  abbr: 'ATL' },
  'Boston Celtics':         { espn: 'bos',  abbr: 'BOS' },
  'Brooklyn Nets':          { espn: 'bkn',  abbr: 'BKN' },
  'Charlotte Hornets':      { espn: 'cha',  abbr: 'CHA' },
  'Chicago Bulls':          { espn: 'chi',  abbr: 'CHI' },
  'Cleveland Cavaliers':    { espn: 'cle',  abbr: 'CLE' },
  'Dallas Mavericks':       { espn: 'dal',  abbr: 'DAL' },
  'Denver Nuggets':         { espn: 'den',  abbr: 'DEN' },
  'Detroit Pistons':        { espn: 'det',  abbr: 'DET' },
  'Golden State Warriors':  { espn: 'gsw',  abbr: 'GSW' },
  'Houston Rockets':        { espn: 'hou',  abbr: 'HOU' },
  'Indiana Pacers':         { espn: 'ind',  abbr: 'IND' },
  'LA Clippers':            { espn: 'lac',  abbr: 'LAC' },
  'Los Angeles Lakers':     { espn: 'lal',  abbr: 'LAL' },
  'Memphis Grizzlies':      { espn: 'mem',  abbr: 'MEM' },
  'Miami Heat':             { espn: 'mia',  abbr: 'MIA' },
  'Milwaukee Bucks':        { espn: 'mil',  abbr: 'MIL' },
  'Minnesota Timberwolves': { espn: 'min',  abbr: 'MIN' },
  'New Orleans Pelicans':   { espn: 'no',   abbr: 'NOP' },
  'New York Knicks':        { espn: 'ny',   abbr: 'NYK' },
  'Oklahoma City Thunder':  { espn: 'okc',  abbr: 'OKC' },
  'Orlando Magic':          { espn: 'orl',  abbr: 'ORL' },
  'Philadelphia 76ers':     { espn: 'phi',  abbr: 'PHI' },
  'Phoenix Suns':           { espn: 'phx',  abbr: 'PHX' },
  'Portland Trail Blazers': { espn: 'por',  abbr: 'POR' },
  'Sacramento Kings':       { espn: 'sac',  abbr: 'SAC' },
  'San Antonio Spurs':      { espn: 'sas',  abbr: 'SAS' },
  'Toronto Raptors':        { espn: 'tor',  abbr: 'TOR' },
  'Utah Jazz':              { espn: 'utah', abbr: 'UTA' },
  'Washington Wizards':     { espn: 'wsh',  abbr: 'WAS' },
}

export function teamLogoUrl(teamName: string): string | null {
  const entry = TEAMS[teamName]
  if (!entry) return null
  // Loghi scaricati in public/teams/ (WebP 128 px) per evitare il caricamento da ESPN
  return `/teams/${entry.espn}.webp`
}

export function teamAbbreviation(teamName: string): string | null {
  return TEAMS[teamName]?.abbr ?? null
}
