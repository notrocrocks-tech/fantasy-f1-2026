import { useState, useEffect, useRef } from 'react'
import { useLeagueData } from './hooks/useLeagueData'

const JOLPICA_BASE = 'https://api.jolpi.ca/ergast/f1'
const SEASON = '2026'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function jolpicaFetch(endpoint) {
  const res = await fetch(`${JOLPICA_BASE}${endpoint}`)
  if (!res.ok) throw new Error(`Jolpica API returned ${res.status}`)
  const data = await res.json()
  return data.MRData
}

async function fetchDriverStandings() {
  try {
    const data = await jolpicaFetch(`/${SEASON}/driverstandings.json`)
    const lists = data?.StandingsTable?.StandingsLists
    if (!lists || lists.length === 0) return []
    return lists[0].DriverStandings.map((s) => ({
      pos: parseInt(s.position),
      name: `${s.Driver.givenName} ${s.Driver.familyName}`,
      team: s.Constructors?.[0]?.name || 'Unknown',
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
    }))
  } catch {
    return []
  }
}

async function fetchConstructorStandings() {
  try {
    const data = await jolpicaFetch(`/${SEASON}/constructorstandings.json`)
    const lists = data?.StandingsTable?.StandingsLists
    if (!lists || lists.length === 0) return []
    return lists[0].ConstructorStandings.map((s) => ({
      pos: parseInt(s.position),
      name: s.Constructor.name,
      points: parseFloat(s.points),
    }))
  } catch {
    return []
  }
}

async function fetchRaceResults() {
  try {
    const data = await jolpicaFetch(`/${SEASON}/results.json?limit=500`)
    const races = data?.RaceTable?.Races
    if (!races || races.length === 0) return []
    return races.map((race) => ({
      round: parseInt(race.round),
      name: race.raceName,
      location: race.Circuit?.Location?.locality || '',
      date: race.date,
      results: (race.Results || []).slice(0, 10).map((r) => ({
        pos: parseInt(r.position),
        driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
        team: r.Constructor?.name || '',
        grid: parseInt(r.grid),
        points: parseFloat(r.points),
      })),
    }))
  } catch {
    return []
  }
}

async function fetchCalendar() {
  try {
    const data = await jolpicaFetch(`/${SEASON}.json`)
    return (data?.RaceTable?.Races || []).map((r) => ({
      round: parseInt(r.round),
      name: r.raceName,
      date: r.date,                          // race day ISO string
      location: r.Circuit?.Location?.locality || '',
      country: r.Circuit?.Location?.country || '',
    }))
  } catch {
    return []
  }
}

async function initializeRacesFromJolpi() {
  try {
    const data = await jolpicaFetch(`/${SEASON}.json`)
    const races = data?.RaceTable?.Races || []
    return races.map((r) => ({
      id: parseInt(r.round),
      name: r.raceName,
      date: r.date,
      location: r.Circuit?.Location?.locality || '',
      circuit: r.Circuit?.circuitName || '',
      isFinished: new Date(r.date) < new Date(),
      participants: {},
      results: undefined,
    }))
  } catch (e) {
    console.error('Failed to initialize races from Jolpi:', e)
    return []
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const F1_2026_DRIVERS = [
  'Max Verstappen', 'Liam Lawson',
  'Charles Leclerc', 'Lewis Hamilton',
  'George Russell', 'Andrea Kimi Antonelli',
  'Lando Norris', 'Oscar Piastri',
  'Fernando Alonso', 'Lance Stroll',
  'Pierre Gasly', 'Jack Doohan',
  'Yuki Tsunoda', 'Isack Hadjar',
  'Esteban Ocon', 'Oliver Bearman',
  'Nico Hülkenberg', 'Gabriel Bortoleto',
  'Carlos Sainz', 'Alexander Albon',
]

const TEAM_COLORS = {
  'Red Bull': '#3671C6',
  'Ferrari': '#E8002D',
  'Mercedes': '#27F4D2',
  'McLaren': '#FF8000',
  'Aston Martin': '#229971',
  'Alpine': '#FF87BC',
  'Racing Bulls': '#6692FF',
  'Haas': '#B6BABD',
  'Williams': '#64C4FF',
  'Audi': '#52E252',
}

const MEDAL = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }

// Lock deadline = Saturday 09:00 UTC on race weekend (race day - 1 day + 9h)
function getLockTime(raceDateStr) {
  const raceDay = new Date(`${raceDateStr}T00:00:00Z`)
  const saturday = new Date(raceDay)
  saturday.setUTCDate(raceDay.getUTCDate() - 1)
  saturday.setUTCHours(9, 0, 0, 0)
  return saturday
}

function isRaceLocked(raceDateStr) {
  return new Date() >= getLockTime(raceDateStr)
}

function formatCountdown(raceDateStr) {
  const diff = getLockTime(raceDateStr) - Date.now()
  if (diff <= 0) return null
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return `Locks in ${d}d ${h}h`
  if (h > 0) return `Locks in ${h}h ${m}m`
  return `Locks in ${m}m`
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// Season fantasy score: sum of season championship points for picked drivers
function fantasyScore(picks, standings) {
  return picks.reduce((sum, pick) => {
    const last = pick.toLowerCase().split(' ').slice(-1)[0]
    const match = standings.find((d) => d.name?.toLowerCase().includes(last))
    return sum + (match?.points || 0)
  }, 0)
}

// Race fantasy score: sum of points a picked driver scored in that specific race
function raceFantasyScore(pickedNames, raceResults) {
  return pickedNames.reduce((sum, name) => {
    const last = name.toLowerCase().split(' ').slice(-1)[0]
    const match = raceResults.find((r) => r.driver?.toLowerCase().includes(last))
    return sum + (match?.points || 0)
  }, 0)
}

function teamColor(name) {
  const key = Object.keys(TEAM_COLORS).find((k) =>
    name?.toLowerCase().includes(k.toLowerCase())
  )
  return key ? TEAM_COLORS[key] : '#888'
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const S = {
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 5,
    padding: '10px 14px',
    color: '#eee',
    fontSize: 15,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 5,
    padding: '10px 14px',
    color: '#eee',
    fontSize: 15,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    appearance: 'none',
    cursor: 'pointer',
  },
  btn: {
    background: '#e60000',
    border: 'none',
    borderRadius: 5,
    color: '#fff',
    padding: '11px 24px',
    fontFamily: 'inherit',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  ghost: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 5,
    color: '#aaa',
    padding: '8px 14px',
    fontFamily: 'inherit',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: '#e60000',
  },
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Badge({ rank }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: MEDAL[rank] || 'rgba(255,255,255,0.08)',
      color: rank <= 3 ? '#000' : '#999', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, fontSize: 13,
    }}>{rank}</div>
  )
}

function Spinner({ msg }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0', color: '#555' }}>
      <div style={{ fontSize: 48, display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</div>
      {msg && <div style={{ marginTop: 14, fontSize: 14 }}>{msg}</div>}
    </div>
  )
}

function Empty({ msg, onAction, actionLabel }) {
  return (
    <div style={{ textAlign: 'center', padding: '70px 0', color: '#555' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
      <div style={{ fontSize: 14, marginBottom: onAction ? 18 : 0 }}>{msg}</div>
      {onAction && <button style={S.btn} onClick={onAction}>{actionLabel}</button>}
    </div>
  )
}

function LockBadge({ raceDateStr }) {
  const locked = isRaceLocked(raceDateStr)
  const countdown = formatCountdown(raceDateStr)
  if (locked) {
    return (
      <span style={{
        background: 'rgba(230,0,0,0.15)',
        border: '1px solid rgba(230,0,0,0.4)',
        color: '#ff6666',
        fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
        textTransform: 'uppercase', padding: '4px 10px', borderRadius: 4,
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}>🔒 Picks Locked</span>
    )
  }
  return (
    <span style={{
      background: 'rgba(34,200,100,0.1)',
      border: '1px solid rgba(34,200,100,0.3)',
      color: '#4dde8a',
      fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
      textTransform: 'uppercase', padding: '4px 10px', borderRadius: 4,
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>🟢 Open{countdown ? ` · ${countdown}` : ''}</span>
  )
}

// ---------------------------------------------------------------------------
// Race Grid Tab
// ---------------------------------------------------------------------------

function RaceGridTab({ leagueData, saveLeagueData, calendar, raceResults, loading }) {
  const participants = leagueData?.participants || {}
  const participantList = Object.entries(participants)

  const [selectedRound, setSelectedRound] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [picks, setPicks] = useState(['', '', '', '', '', ''])
  const [saved, setSaved] = useState(false)

  // Auto-select the next upcoming race on first load
  useEffect(() => {
    if (calendar.length > 0 && !selectedRound) {
      const upcoming = calendar.find((r) => !isRaceLocked(r.date))
      const target = upcoming || calendar[calendar.length - 1]
      setSelectedRound(String(target.round))
    }
  }, [calendar])

  // Auto-select first participant when race changes
  useEffect(() => {
    if (participantList.length > 0 && !selectedUserId) {
      setSelectedUserId(participantList[0][0])
    }
  }, [participantList])

  // Load existing picks when race or participant changes
  useEffect(() => {
    if (!selectedRound || !selectedUserId || !leagueData) return
  
    const racePicks = leagueData.races?.find((r) => r.id === parseInt(selectedRound))
      ?.participants?.[selectedUserId]?.picks
  
    if (racePicks && racePicks.length > 0) {
      const padded = [...racePicks]
      while (padded.length < 6) padded.push('')
      setPicks(padded)
    } else {
      const seasonPicks = leagueData.participants[selectedUserId]
        ?.seasonPicks?.drivers?.map((d) => d.name) || []
      const padded = [...seasonPicks]
      while (padded.length < 6) padded.push('')
      setPicks(padded)
    }
  
    setSaved(false)
  }, [selectedRound, selectedUserId, leagueData])

  const selectedRace = calendar.find((r) => r.round === parseInt(selectedRound))
  const locked = selectedRace ? isRaceLocked(selectedRace.date) : false

  function savePicks() {
    if (!leagueData || !selectedRound || !selectedUserId) return
    const roundId = parseInt(selectedRound)
    const filledPicks = picks.filter((p) => p.trim())

    const existingRaces = leagueData.races || []
    const raceIdx = existingRaces.findIndex((r) => r.id === roundId)

    let updatedRaces
    if (raceIdx >= 0) {
      updatedRaces = existingRaces.map((r, i) => {
        if (i !== raceIdx) return r
        return {
          ...r,
          participants: {
            ...r.participants,
            [selectedUserId]: { picks: filledPicks },
          },
        }
      })
    } else {
      // Race slot doesn't exist yet — create a minimal one
      const raceInfo = calendar.find((r) => r.round === roundId)
      updatedRaces = [
        ...existingRaces,
        {
          id: roundId,
          name: raceInfo?.name || `Round ${roundId}`,
          date: raceInfo?.date || '',
          location: raceInfo?.location || '',
          isFinished: raceInfo ? isRaceLocked(raceInfo.date) : false,
          participants: {
            [selectedUserId]: { picks: filledPicks },
          },
        },
      ]
    }

    saveLeagueData({
      ...leagueData,
      races: updatedRaces,
      lastUpdated: new Date().toISOString(),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Lookup actual race results for the selected round (for locked races)
  const actualResults = raceResults.find((r) => r.round === parseInt(selectedRound))

  if (participantList.length === 0) {
    return <Empty msg="No participants set up yet." onAction={undefined} actionLabel="" />
  }

  if (calendar.length === 0 && loading) {
    return <Spinner msg="Loading calendar…" />
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={S.label}>Race-by-Race</div>
        <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>Race Grid Picks</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Set each participant's driver picks for a specific race. Picks lock on the Saturday morning before each race.
        </p>
      </div>

      {/* Race + Participant selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ ...S.label, marginBottom: 8 }}>Race</div>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedRound}
              onChange={(e) => setSelectedRound(e.target.value)}
              style={S.select}
            >
              <option value="">Select a race…</option>
              {calendar.map((r) => (
                <option key={r.round} value={r.round}>
                  R{r.round} · {r.name} ({r.date})
                </option>
              ))}
            </select>
            <div style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: '#666', fontSize: 12,
            }}>▾</div>
          </div>
        </div>
        <div>
          <div style={{ ...S.label, marginBottom: 8 }}>Participant</div>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={S.select}
            >
              <option value="">Select participant…</option>
              {participantList.map(([uid, p]) => (
                <option key={uid} value={uid}>{p.name}</option>
              ))}
            </select>
            <div style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: '#666', fontSize: 12,
            }}>▾</div>
          </div>
        </div>
      </div>

      {selectedRace && (
        <div style={{ ...S.card, overflow: 'hidden', marginBottom: 24 }}>
          {/* Race header */}
          <div style={{
            background: 'rgba(230,0,0,0.08)',
            borderBottom: '1px solid rgba(230,0,0,0.15)',
            padding: '16px 22px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                background: '#e60000', color: '#fff',
                fontWeight: 900, fontSize: 11, padding: '4px 10px', borderRadius: 4,
              }}>R{selectedRace.round}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedRace.name}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  {selectedRace.location} · {selectedRace.date}
                </div>
              </div>
            </div>
            <LockBadge raceDateStr={selectedRace.date} />
          </div>

          {/* Pick form */}
          <div style={{ padding: 22 }}>
            {locked && (
              <div style={{
                background: 'rgba(230,0,0,0.07)',
                border: '1px solid rgba(230,0,0,0.18)',
                borderRadius: 6, padding: '10px 16px',
                fontSize: 13, color: '#ff8888', marginBottom: 18,
              }}>
                Picks are locked for this race. You can view but not edit.
              </div>
            )}

            <div style={{ ...S.label, marginBottom: 12 }}>
              Driver Picks for {participants[selectedUserId]?.name || '—'} (up to 6)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
              {picks.map((pick, i) => (
                <input
                  key={i}
                  list="f1-drivers-race"
                  placeholder={`Pick ${i + 1}`}
                  value={pick}
                  disabled={locked}
                  onChange={(e) => {
                    const u = [...picks]
                    u[i] = e.target.value
                    setPicks(u)
                  }}
                  style={{
                    ...S.input,
                    opacity: locked ? 0.5 : 1,
                    cursor: locked ? 'not-allowed' : 'text',
                  }}
                />
              ))}
            </div>
            <datalist id="f1-drivers-race">
              {F1_2026_DRIVERS.map((d) => <option key={d} value={d} />)}
            </datalist>

            {!locked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button style={S.btn} onClick={savePicks}>Save Picks</button>
                {saved && (
                  <span style={{ fontSize: 12, color: '#4dde8a', letterSpacing: 0.5 }}>
                    ✓ Saved
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* All participants' picks for this race — overview */}
      {selectedRace && participantList.length > 0 && (
        <div>
          <div style={{ ...S.label, marginBottom: 14 }}>All Picks — {selectedRace.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {participantList.map(([uid, p]) => {
              const racePicks = leagueData.races?.find((r) => r.id === parseInt(selectedRound))
                ?.participants?.[uid]?.picks || []
              const score = actualResults
                ? raceFantasyScore(racePicks, actualResults.results)
                : null
              const isActive = uid === selectedUserId
              return (
                <div
                  key={uid}
                  onClick={() => setSelectedUserId(uid)}
                  style={{
                    ...S.card,
                    padding: '14px 18px',
                    display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                    border: isActive
                      ? '1px solid rgba(230,0,0,0.4)'
                      : '1px solid rgba(255,255,255,0.08)',
                    background: isActive ? 'rgba(230,0,0,0.06)' : 'rgba(255,255,255,0.03)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, minWidth: 120 }}>{p.name}</div>
                  <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {racePicks.length === 0 ? (
                      <span style={{ fontSize: 12, color: '#444', fontStyle: 'italic' }}>No picks yet</span>
                    ) : (
                      racePicks.map((d, j) => {
                        const result = actualResults?.results.find((r) =>
                          r.driver?.toLowerCase().includes(d.toLowerCase().split(' ').slice(-1)[0])
                        )
                        return (
                          <span key={j} style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 4, padding: '3px 9px', fontSize: 12, color: '#bbb',
                          }}>
                            {d}
                            {result && <span style={{ color: '#ff8800', marginLeft: 4 }}>{result.points}pts</span>}
                          </span>
                        )
                      })
                    )}
                  </div>
                  {score !== null && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#ff8800' }}>{score}</div>
                      <div style={{ fontSize: 9, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' }}>pts</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cumulative Results Tab
// ---------------------------------------------------------------------------

function CumulativeResultsTab({ leagueData, calendar, raceResults, loading }) {
  const participants = leagueData?.participants || {}
  const participantList = Object.entries(participants)

  if (participantList.length === 0) {
    return <Empty msg="No participants set up yet." onAction={undefined} actionLabel="" />
  }

  // Build cumulative leaderboard from all completed races
  const completedRaces = raceResults.filter((r) => r.results && r.results.length > 0)

  // For each participant, calculate race-by-race points and running total
  const leaderboard = participantList.map(([uid, p]) => {
    let cumulativePoints = 0
    const raceBreakdown = completedRaces.map((race) => {
      const savedPicks = leagueData.races?.find((r) => r.id === race.round)
        ?.participants?.[uid]?.picks
      const racePicks = (savedPicks && savedPicks.length > 0)
        ? savedPicks
        : p.seasonPicks?.drivers?.map((d) => d.name) || []
      const pts = raceFantasyScore(racePicks, race.results)
      cumulativePoints += pts
      return {
        round: race.round,
        name: race.name,
        date: race.date,
        picks: racePicks,
        pts,
        running: cumulativePoints,
      }
    })
    return {
      uid,
      name: p.name,
      totalPts: cumulativePoints,
      raceBreakdown,
    }
  })
    .sort((a, b) => b.totalPts - a.totalPts)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  const [expandedUid, setExpandedUid] = useState(null)

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={S.label}>Fantasy</div>
        <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>Cumulative Results</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Race-by-race fantasy points based on per-race driver picks. Click a participant to see the breakdown.
        </p>
      </div>

      {loading && completedRaces.length === 0 ? (
        <Spinner msg="Loading race results…" />
      ) : completedRaces.length === 0 ? (
        <Empty msg="No completed races yet for the 2026 season." onAction={undefined} actionLabel="" />
      ) : (
        <>
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `56px 200px repeat(${Math.min(completedRaces.length, 8)}, 1fr) 90px`,
            gap: 8, padding: '8px 20px',
            fontSize: 9, letterSpacing: 2, color: '#555', fontWeight: 700, textTransform: 'uppercase',
            overflowX: 'auto',
          }}>
            <span>Pos</span>
            <span>Participant</span>
            {completedRaces.slice(0, 8).map((r) => (
              <span key={r.round} style={{ textAlign: 'center' }}>R{r.round}</span>
            ))}
            <span style={{ textAlign: 'right' }}>Total</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {leaderboard.map((p) => (
              <div key={p.uid}>
                {/* Main row */}
                <div
                  onClick={() => setExpandedUid(expandedUid === p.uid ? null : p.uid)}
                  style={{
                    ...S.card,
                    display: 'grid',
                    gridTemplateColumns: `56px 200px repeat(${Math.min(completedRaces.length, 8)}, 1fr) 90px`,
                    gap: 8, alignItems: 'center', padding: '16px 20px',
                    cursor: 'pointer',
                    background: p.rank === 1 ? 'rgba(255,215,0,0.05)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${expandedUid === p.uid ? 'rgba(230,0,0,0.35)' : p.rank === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'border-color 0.15s',
                    overflowX: 'auto',
                  }}
                >
                  <Badge rank={p.rank} />
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  {p.raceBreakdown.slice(0, 8).map((rb) => (
                    <div key={rb.round} style={{ textAlign: 'center' }}>
                      {rb.picks.length === 0 ? (
                        <span style={{ color: '#383838', fontSize: 13 }}>—</span>
                      ) : (
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: rb.pts > 0 ? '#ff8800' : '#555',
                        }}>{rb.pts}</span>
                      )}
                    </div>
                  ))}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: p.rank === 1 ? '#FFD700' : '#fff' }}>
                      {p.totalPts}
                    </div>
                    <div style={{ fontSize: 9, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' }}>pts</div>
                  </div>
                </div>

                {/* Expanded breakdown */}
                {expandedUid === p.uid && (
                  <div style={{
                    ...S.card,
                    margin: '2px 0 6px 0',
                    background: 'rgba(230,0,0,0.04)',
                    border: '1px solid rgba(230,0,0,0.2)',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '18px 22px',
                  }}>
                    <div style={{ ...S.label, marginBottom: 14 }}>Race breakdown — {p.name}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {p.raceBreakdown.map((rb) => (
                        <div key={rb.round} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 14,
                          paddingBottom: 10,
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <div style={{
                            background: '#e60000', color: '#fff',
                            fontWeight: 900, fontSize: 10, padding: '3px 8px',
                            borderRadius: 3, flexShrink: 0, marginTop: 2,
                          }}>R{rb.round}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>
                              {rb.name} · {rb.date}
                            </div>
                            {rb.picks.length === 0 ? (
                              <span style={{ fontSize: 12, color: '#444', fontStyle: 'italic' }}>No picks entered</span>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {rb.picks.map((d, j) => (
                                  <span key={j} style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 4, padding: '3px 9px',
                                    fontSize: 12, color: '#bbb',
                                  }}>{d}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{
                              fontSize: 20, fontWeight: 900,
                              color: rb.pts > 0 ? '#ff8800' : '#555',
                            }}>{rb.pts}</div>
                            <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase' }}>
                              race pts
                            </div>
                            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                              {rb.running} total
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Overflow note if > 8 races */}
          {completedRaces.length > 8 && (
            <div style={{ fontSize: 11, color: '#555', marginTop: 12, textAlign: 'center' }}>
              Showing R1–R8 in grid · click any row for the full breakdown
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const [tab, setTab] = useState('setup')
  const [formName, setFormName] = useState('')
  const [formPicks, setFormPicks] = useState(['', '', '', '', '', ''])
  const [editIdx, setEditIdx] = useState(null)

  const [drivers, setDrivers] = useState([])
  const [teams, setTeams] = useState([])
  const [races, setRaces] = useState([])        // completed race results from Jolpica
  const [calendar, setCalendar] = useState([])  // full 2026 calendar
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState(null)
  const didFetch = useRef(false)

  const { leagueData, loading: leagueLoading, error: leagueError, save: saveLeagueData } = useLeagueData()

  // Initialise race stubs in leagueData if empty
  useEffect(() => {
    if (leagueData && leagueData.races.length === 0) {
      initializeRacesFromJolpi().then((newRaces) => {
        saveLeagueData({
          ...leagueData,
          races: newRaces,
          lastUpdated: new Date().toISOString(),
        })
      })
    }
  }, [leagueData, saveLeagueData])

  // -------------------------------------------------------------------------
  // Participant CRUD (unchanged from original)
  // -------------------------------------------------------------------------

  function saveParticipant() {
    if (!formName.trim() || !leagueData) return
    const picks = formPicks.filter((p) => p.trim())

    if (editIdx !== null) {
      const userIds = Object.keys(leagueData.participants)
      const userId = userIds[editIdx]
      saveLeagueData({
        ...leagueData,
        participants: {
          ...leagueData.participants,
          [userId]: {
            ...leagueData.participants[userId],
            name: formName.trim(),
            seasonPicks: {
              ...leagueData.participants[userId].seasonPicks,
              drivers: picks.map((name) => ({ id: name, name, team: '' })),
            },
          },
        },
        lastUpdated: new Date().toISOString(),
      })
      setEditIdx(null)
    } else {
      const userId = `user_${Date.now()}`
      saveLeagueData({
        ...leagueData,
        participants: {
          ...leagueData.participants,
          [userId]: {
            name: formName.trim(),
            seasonPicks: {
              drivers: picks.map((name) => ({ id: name, name, team: '' })),
              teams: [],
            },
          },
        },
        lastUpdated: new Date().toISOString(),
      })
    }
    setFormName('')
    setFormPicks(['', '', '', '', '', ''])
  }

  function startEdit(userId) {
    const p = leagueData?.participants[userId]
    if (!p) return
    setEditIdx(leagueData ? Object.keys(leagueData.participants).indexOf(userId) : -1)
    setFormName(p.name)
    const picks = p.seasonPicks.drivers.map((d) => d.name)
    while (picks.length < 6) picks.push('')
    setFormPicks(picks)
  }

  function cancelEdit() {
    setEditIdx(null)
    setFormName('')
    setFormPicks(['', '', '', '', '', ''])
  }

  function removeParticipant(userId) {
    if (!leagueData) return
    const { [userId]: _, ...remaining } = leagueData.participants
    saveLeagueData({
      ...leagueData,
      participants: remaining,
      lastUpdated: new Date().toISOString(),
    })
  }

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (tab !== 'setup' && !didFetch.current) {
      didFetch.current = true
      doFetch()
    }
  }, [tab])

  async function doFetch() {
    setLoading(true)
    setError('')
    try {
      setLoadMsg('Fetching calendar…')
      const cal = await fetchCalendar()
      setCalendar(cal)

      setLoadMsg('Fetching driver standings…')
      const d = await fetchDriverStandings()
      setDrivers(d)

      setLoadMsg('Fetching constructor standings…')
      const t = await fetchConstructorStandings()
      setTeams(t)

      setLoadMsg('Fetching race results…')
      const r = await fetchRaceResults()
      setRaces(r)

      setUpdated(new Date().toLocaleTimeString())
    } catch (e) {
      setError(`Could not load live data from Jolpica F1 API. (${e.message})`)
    }
    setLoading(false)
    setLoadMsg('')
  }

  function refresh() {
    didFetch.current = true
    doFetch()
  }

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const leagueTable = leagueData
    ? [...Object.entries(leagueData.participants)]
        .map(([userId, p]) => ({
          userId,
          ...p,
          pts: fantasyScore(p.seasonPicks.drivers.map((d) => d.name), drivers),
        }))
        .sort((a, b) => b.pts - a.pts)
        .map((p, i) => ({ ...p, rank: i + 1 }))
    : []

  const TABS = [
    { id: 'setup',      label: '⚙ Setup' },
    { id: 'league',     label: '🏆 League' },
    { id: 'racegrid',   label: '🎯 Race Grid' },
    { id: 'cumulative', label: '📈 Cumulative' },
    { id: 'races',      label: '🏁 Races' },
    { id: 'standings',  label: '📊 Standings' },
  ]

  // -------------------------------------------------------------------------
  // Loading / error gates
  // -------------------------------------------------------------------------

  if (leagueLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0b10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner msg="Loading league data…" />
      </div>
    )
  }

  if (!leagueData) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0b10', color: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#ff6666' }}>Error loading league data. Try refreshing the page.</div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0b0b10',
      color: '#e8e8f0',
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      backgroundImage: `
        radial-gradient(ellipse at 15% 60%, rgba(230,0,0,0.07) 0%, transparent 55%),
        radial-gradient(ellipse at 85% 10%, rgba(255,130,0,0.04) 0%, transparent 50%)
      `,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0b0b10; }
        input:focus, select:focus { outline: none; border-color: rgba(230,0,0,0.55) !important; }
        select option { background: #1a1a22; color: #eee; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <header style={{
        background: 'rgba(0,0,0,0.85)',
        borderBottom: '2px solid #e60000',
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'stretch' }}>
          <div style={{
            background: '#e60000',
            padding: '14px 36px 14px 20px',
            clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 100%, 0 100%)',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: -1 }}>F1</span>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: 3 }}>FANTASY LEAGUE</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2 }}>2026 SEASON</div>
            </div>
          </div>
          <nav style={{ display: 'flex', flex: 1, alignItems: 'center', paddingLeft: 8, overflowX: 'auto' }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: 'none', border: 'none',
                borderBottom: tab === t.id ? '3px solid #e60000' : '3px solid transparent',
                color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.4)',
                padding: '20px 16px 17px',
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                letterSpacing: 1.5, textTransform: 'uppercase',
                fontFamily: 'inherit', transition: 'color 0.15s',
                whiteSpace: 'nowrap',
              }}>{t.label}</button>
            ))}
          </nav>
          {tab !== 'setup' && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flexShrink: 0 }}>
              {updated && !loading && (
                <span style={{ fontSize: 10, color: '#555', letterSpacing: 0.5 }}>Updated {updated}</span>
              )}
              <button onClick={refresh} disabled={loading} style={{
                ...S.ghost,
                borderColor: 'rgba(230,0,0,0.4)',
                color: loading ? '#444' : '#e60000',
              }}>
                {loading ? '…' : '↻ Refresh'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px' }}>

        {(error || leagueError) && (
          <div style={{
            background: 'rgba(230,0,0,0.1)', border: '1px solid rgba(230,0,0,0.3)',
            borderRadius: 6, padding: '12px 18px', marginBottom: 24,
            fontSize: 13, color: '#ff8888', lineHeight: 1.5,
          }}>{error || leagueError}</div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Setup tab                                                         */}
        {/* ---------------------------------------------------------------- */}
        {tab === 'setup' && (
          <div>
            <div style={{ marginBottom: 36 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 42, fontWeight: 900, margin: '6px 0 8px', letterSpacing: -0.5 }}>League Setup</h1>
              <p style={{ color: '#666', fontSize: 14, lineHeight: 1.5 }}>
                Add participants and assign up to 6 season drivers each.<br />
                Use the Race Grid tab to set per-race picks.
              </p>
            </div>

            <div style={{ ...S.card, padding: 26, marginBottom: 28 }}>
              <div style={{ ...S.label, marginBottom: 16 }}>
                {editIdx !== null ? '✎ Edit Participant' : '＋ Add Participant'}
              </div>
              <input
                placeholder="Participant name…"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveParticipant()}
                style={{ ...S.input, marginBottom: 14 }}
              />
              <div style={{ ...S.label, marginBottom: 10 }}>Season Driver Picks (up to 6)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                {formPicks.map((pick, i) => (
                  <input
                    key={i}
                    list="f1-drivers"
                    placeholder={`Pick ${i + 1}`}
                    value={pick}
                    onChange={(e) => {
                      const u = [...formPicks]
                      u[i] = e.target.value
                      setFormPicks(u)
                    }}
                    style={S.input}
                  />
                ))}
              </div>
              <datalist id="f1-drivers">
                {F1_2026_DRIVERS.map((d) => <option key={d} value={d} />)}
              </datalist>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={S.btn} onClick={saveParticipant}>
                  {editIdx !== null ? 'Save Changes' : 'Add Participant'}
                </button>
                {editIdx !== null && (
                  <button style={S.ghost} onClick={cancelEdit}>Cancel</button>
                )}
              </div>
            </div>

            {Object.keys(leagueData.participants).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: '#444', fontSize: 14 }}>
                No participants yet – add your first one above.
              </div>
            ) : (
              <>
                <div style={{ ...S.label, marginBottom: 12 }}>
                  {Object.keys(leagueData.participants).length} Participant{Object.keys(leagueData.participants).length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(leagueData.participants).map(([userId, p], i) => (
                    <div key={userId} style={{
                      ...S.card, padding: '16px 20px',
                      display: 'flex', alignItems: 'center', gap: 16,
                    }}>
                      <div style={{
                        width: 36, height: 36, background: '#e60000', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: 15, flexShrink: 0,
                      }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{p.name}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {p.seasonPicks.drivers.map((d, j) => (
                            <span key={j} style={{
                              background: 'rgba(255,255,255,0.07)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 4, padding: '3px 10px', fontSize: 12, color: '#ccc',
                            }}>{d.name}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={S.ghost} onClick={() => startEdit(userId)}>Edit</button>
                        <button
                          style={{ ...S.ghost, color: '#e60000', borderColor: 'rgba(230,0,0,0.3)' }}
                          onClick={() => removeParticipant(userId)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 28, textAlign: 'center' }}>
                  <button style={{ ...S.btn, padding: '14px 48px', fontSize: 15 }} onClick={() => setTab('league')}>
                    View League Table →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* League tab                                                         */}
        {/* ---------------------------------------------------------------- */}
        {tab === 'league' && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.label}>Fantasy</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>League Table</h1>
              <p style={{ color: '#666', fontSize: 14 }}>
                {Object.keys(leagueData.participants).length} participant{Object.keys(leagueData.participants).length !== 1 ? 's' : ''} · Points = sum of season driver championship points
              </p>
            </div>
            {Object.keys(leagueData.participants).length === 0 ? (
              <Empty msg="No participants set up yet." onAction={() => setTab('setup')} actionLabel="Go to Setup" />
            ) : loading ? (
              <Spinner msg={loadMsg} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '56px 220px 1fr 90px',
                  gap: 14, padding: '8px 20px',
                  fontSize: 9, letterSpacing: 2, color: '#555', fontWeight: 700, textTransform: 'uppercase',
                }}>
                  <span>Pos</span><span>Participant</span><span>Drivers & Points</span><span style={{ textAlign: 'right' }}>Total</span>
                </div>
                {leagueTable.map((p, i) => (
                  <div key={p.userId} style={{
                    ...S.card,
                    display: 'grid', gridTemplateColumns: '56px 220px 1fr 90px',
                    gap: 14, alignItems: 'center', padding: '18px 20px',
                    background: i === 0 ? 'rgba(255,215,0,0.05)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${i === 0 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.07)'}`,
                  }}>
                    <Badge rank={p.rank} />
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.seasonPicks.drivers.map((d, j) => {
                        const ds = drivers.find((x) => x.name?.toLowerCase().includes(d.name.toLowerCase()))
                        return (
                          <span key={j} style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.09)',
                            borderRadius: 4, padding: '3px 9px', fontSize: 12, color: '#bbb',
                          }}>
                            {d.name}{ds ? <span style={{ color: '#ff8800', marginLeft: 4 }}>{ds.points}pts</span> : ''}
                          </span>
                        )
                      })}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: i === 0 ? '#FFD700' : '#fff' }}>{p.pts}</div>
                      <div style={{ fontSize: 9, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' }}>points</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Race Grid tab                                                      */}
        {/* ---------------------------------------------------------------- */}
        {tab === 'racegrid' && (
          loading && calendar.length === 0 ? (
            <Spinner msg={loadMsg} />
          ) : (
            <RaceGridTab
              leagueData={leagueData}
              saveLeagueData={saveLeagueData}
              calendar={calendar}
              raceResults={races}
              loading={loading}
            />
          )
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Cumulative Results tab                                             */}
        {/* ---------------------------------------------------------------- */}
        {tab === 'cumulative' && (
          <CumulativeResultsTab
            leagueData={leagueData}
            calendar={calendar}
            raceResults={races}
            loading={loading}
          />
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Races tab                                                          */}
        {/* ---------------------------------------------------------------- */}
        {tab === 'races' && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>Race Results</h1>
            </div>
            {loading ? (
              <Spinner msg={loadMsg} />
            ) : races.length === 0 ? (
              <Empty msg="No completed races yet for the 2026 season." onAction={refresh} actionLabel="Try Refreshing" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[...races].reverse().map((race) => (
                  <div key={race.round} style={{ ...S.card, overflow: 'hidden' }}>
                    <div style={{
                      background: 'rgba(230,0,0,0.1)', borderBottom: '1px solid rgba(230,0,0,0.2)',
                      padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                      <div style={{
                        background: '#e60000', color: '#fff',
                        fontWeight: 900, fontSize: 11, padding: '4px 10px', borderRadius: 4,
                      }}>R{race.round}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{race.name}</div>
                        <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>{race.location} · {race.date}</div>
                      </div>
                    </div>
                    <div style={{ padding: '0 20px 16px' }}>
                      <div style={{
                        display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px 70px',
                        gap: 10, padding: '12px 0 8px',
                        fontSize: 9, letterSpacing: 1.5, color: '#555', fontWeight: 700, textTransform: 'uppercase',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <span>Pos</span><span>Driver</span><span>Team</span>
                        <span style={{ textAlign: 'center' }}>Grid</span>
                        <span style={{ textAlign: 'right' }}>Pts</span>
                      </div>
                      {(race.results || []).map((r, i) => (
                        <div key={i} style={{
                          display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px 70px',
                          gap: 10, alignItems: 'center', padding: '10px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}>
                          <Badge rank={r.pos} />
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.driver}</div>
                          <div style={{ fontSize: 13, color: '#777' }}>{r.team}</div>
                          <div style={{ textAlign: 'center', fontSize: 13, color: '#666' }}>P{r.grid}</div>
                          <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: r.points > 0 ? '#ff8800' : '#555' }}>
                            {r.points}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Standings tab                                                      */}
        {/* ---------------------------------------------------------------- */}
        {tab === 'standings' && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>Championship Standings</h1>
            </div>
            {loading ? (
              <Spinner msg={loadMsg} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
                <div>
                  <div style={{ ...S.label, marginBottom: 12 }}>🏎 Drivers Championship</div>
                  {drivers.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 13, padding: '20px 0' }}>No data yet – try refreshing.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {drivers.map((d, i) => (
                        <div key={i} style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Badge rank={d.pos} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                            <div style={{ fontSize: 12, color: '#666' }}>{d.team}</div>
                          </div>
                          <div style={{ fontWeight: 900, fontSize: 22, color: i === 0 ? '#FFD700' : '#eee' }}>{d.points}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: 12 }}>🏭 Constructors Championship</div>
                  {teams.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 13, padding: '20px 0' }}>No data yet – try refreshing.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {teams.map((t, i) => (
                        <div key={i} style={{ ...S.card, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 4, height: 38, background: teamColor(t.name), borderRadius: 2, flexShrink: 0 }} />
                          <Badge rank={t.pos} />
                          <div style={{ flex: 1, fontWeight: 700, fontSize: 15, color: teamColor(t.name) }}>{t.name}</div>
                          <div style={{ fontWeight: 900, fontSize: 22, color: i === 0 ? '#FFD700' : '#eee' }}>{t.points}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
