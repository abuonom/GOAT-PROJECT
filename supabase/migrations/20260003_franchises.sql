-- Migration 003: Franchises
-- 30 NBA franchises as static reference data.
-- Seeded once; admins can update display fields but not add/remove franchises
-- without a new migration (structural change).

CREATE TABLE franchises (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid  NOT NULL REFERENCES leagues(id),
  name         text  NOT NULL,          -- e.g. 'Boston Celtics'
  abbreviation text  NOT NULL,          -- e.g. 'BOS'
  city         text  NOT NULL,
  conference   text  NOT NULL CHECK (conference IN ('East', 'West')),
  division     text  NOT NULL,
  espn_id      text,                    -- for TeamLogo component
  sort_order   integer NOT NULL DEFAULT 0,
  UNIQUE(league_id, abbreviation)
);

-- Seed all 30 NBA franchises
-- ESPN IDs match teamLogos.ts espn field
DO $$
DECLARE league uuid;
BEGIN
  SELECT id INTO league FROM leagues WHERE name = 'GOAT League' LIMIT 1;

  INSERT INTO franchises (league_id, name, abbreviation, city, conference, division, espn_id, sort_order) VALUES
  -- East — Atlantic
  (league, 'Boston Celtics',        'BOS', 'Boston',        'East', 'Atlantic', 'bos',  1),
  (league, 'Brooklyn Nets',         'BKN', 'Brooklyn',      'East', 'Atlantic', 'bkn',  2),
  (league, 'New York Knicks',       'NYK', 'New York',      'East', 'Atlantic', 'ny',   3),
  (league, 'Philadelphia 76ers',    'PHI', 'Philadelphia',  'East', 'Atlantic', 'phi',  4),
  (league, 'Toronto Raptors',       'TOR', 'Toronto',       'East', 'Atlantic', 'tor',  5),
  -- East — Central
  (league, 'Chicago Bulls',         'CHI', 'Chicago',       'East', 'Central',  'chi',  6),
  (league, 'Cleveland Cavaliers',   'CLE', 'Cleveland',     'East', 'Central',  'cle',  7),
  (league, 'Detroit Pistons',       'DET', 'Detroit',       'East', 'Central',  'det',  8),
  (league, 'Indiana Pacers',        'IND', 'Indiana',       'East', 'Central',  'ind',  9),
  (league, 'Milwaukee Bucks',       'MIL', 'Milwaukee',     'East', 'Central',  'mil', 10),
  -- East — Southeast
  (league, 'Atlanta Hawks',         'ATL', 'Atlanta',       'East', 'Southeast','atl', 11),
  (league, 'Charlotte Hornets',     'CHA', 'Charlotte',     'East', 'Southeast','cha', 12),
  (league, 'Miami Heat',            'MIA', 'Miami',         'East', 'Southeast','mia', 13),
  (league, 'Orlando Magic',         'ORL', 'Orlando',       'East', 'Southeast','orl', 14),
  (league, 'Washington Wizards',    'WAS', 'Washington',    'East', 'Southeast','wsh', 15),
  -- West — Northwest
  (league, 'Denver Nuggets',        'DEN', 'Denver',        'West', 'Northwest','den', 16),
  (league, 'Minnesota Timberwolves','MIN', 'Minnesota',     'West', 'Northwest','min', 17),
  (league, 'Oklahoma City Thunder', 'OKC', 'Oklahoma City', 'West', 'Northwest','okc', 18),
  (league, 'Portland Trail Blazers','POR', 'Portland',      'West', 'Northwest','por', 19),
  (league, 'Utah Jazz',             'UTA', 'Utah',          'West', 'Northwest','utah',20),
  -- West — Pacific
  (league, 'Golden State Warriors', 'GSW', 'Golden State',  'West', 'Pacific',  'gs',  21),
  (league, 'LA Clippers',           'LAC', 'Los Angeles',   'West', 'Pacific',  'lac', 22),
  (league, 'Los Angeles Lakers',    'LAL', 'Los Angeles',   'West', 'Pacific',  'lal', 23),
  (league, 'Phoenix Suns',          'PHX', 'Phoenix',       'West', 'Pacific',  'phx', 24),
  (league, 'Sacramento Kings',      'SAC', 'Sacramento',    'West', 'Pacific',  'sac', 25),
  -- West — Southwest
  (league, 'Dallas Mavericks',      'DAL', 'Dallas',        'West', 'Southwest','dal', 26),
  (league, 'Houston Rockets',       'HOU', 'Houston',       'West', 'Southwest','hou', 27),
  (league, 'Memphis Grizzlies',     'MEM', 'Memphis',       'West', 'Southwest','mem', 28),
  (league, 'New Orleans Pelicans',  'NOP', 'New Orleans',   'West', 'Southwest','no',  29),
  (league, 'San Antonio Spurs',     'SAS', 'San Antonio',   'West', 'Southwest','sa',  30);
END $$;

-- league_members: user ↔ franchise assignment per season
CREATE TABLE league_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     uuid        NOT NULL REFERENCES leagues(id),
  season_id     uuid        NOT NULL REFERENCES seasons(id),
  user_id       uuid        NOT NULL REFERENCES auth.users(id),
  franchise_id  uuid        NOT NULL REFERENCES franchises(id),
  games_played  integer     NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season_id, user_id),       -- one franchise per user per season
  UNIQUE(season_id, franchise_id)   -- one user per franchise per season
);

-- RLS
ALTER TABLE franchises     ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "franchises: public read"       ON franchises FOR SELECT USING (true);
CREATE POLICY "franchises: admin write"       ON franchises FOR ALL   USING (is_admin());

-- GM can see all members (to know who owns which franchise)
CREATE POLICY "league_members: authenticated read"
  ON league_members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "league_members: admin write"
  ON league_members FOR ALL USING (is_admin());
