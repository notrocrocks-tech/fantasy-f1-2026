import React, { useState, useEffect, useRef } from 'react'
import { useLeagueData } from './hooks/useLeagueData'

const JOLPICA_BASE = 'https://api.jolpi.ca/ergast/f1'
const SEASON = '2026'

// Sprint weekend round numbers for 2026
const SPRINT_ROUNDS = new Set([4, 8, 12, 16, 18, 20])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Driver {
  pos: number
  name: string
  team: string
  points: number
  wins: number
}

interface Team {
  pos: number
  name: string
  points: number
}

interface RaceResultEntry {
  pos: number
  driver: string
  team: string
  grid?: number
  points: number
}

interface RaceResult {
  round: number
  name: string
  location: string
  date: string
  results: RaceResultEntry[]
}

interface CalendarRace {
  round: number
  name: string
  date: string
  location: string
  country: string
  isSprint: boolean
}

interface DriverPick {
  id: string
  name: string
  team: string
}

interface SeasonPicks {
  drivers: DriverPick[]
  teams: string[]
}

interface Participant {
  name: string
  seasonPicks: SeasonPicks
}

interface RaceParticipantPicks {
  picks: string[]
}

interface RaceEntry {
  id: number
  name: string
  date: string
  location: string
  circuit?: string
  isFinished: boolean
  participants: Record<string, RaceParticipantPicks>
  results?: RaceResultEntry[]
}

interface LeagueData {
  participants: Record<string, Participant>
  races: RaceEntry[]
  lastUpdated: string
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function jolpicaFetch(endpoint: string) {
  const res = await fetch(`${JOLPICA_BASE}${endpoint}`)
  if (!res.ok) throw new Error(`Jolpica API returned ${res.status}`)
  const data = await res.json()
  return data.MRData
}

async function fetchDriverStandings(): Promise<Driver[]> {
  try {
    const data = await jolpicaFetch(`/${SEASON}/driverstandings.json`)
    const lists = data?.StandingsTable?.StandingsLists
    if (!lists || lists.length === 0) return []
    return lists[0].DriverStandings.map((s: any) => ({
      pos: parseInt(s.position),
      name: `${s.Driver.givenName} ${s.Driver.familyName}`,
      team: s.Constructors?.[0]?.name || 'Unknown',
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    throw new Error(`Failed to fetch driver standings: ${msg}`)
  }
}

async function fetchConstructorStandings(): Promise<Team[]> {
  try {
    const data = await jolpicaFetch(`/${SEASON}/constructorstandings.json`)
    const lists = data?.StandingsTable?.StandingsLists
    if (!lists || lists.length === 0) return []
    return lists[0].ConstructorStandings.map((s: any) => ({
      pos: parseInt(s.position),
      name: s.Constructor.name,
      points: parseFloat(s.points),
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    throw new Error(`Failed to fetch constructor standings: ${msg}`)
  }
}

async function fetchRaceResults(): Promise<RaceResult[]> {
  try {
    const data = await jolpicaFetch(`/${SEASON}/results.json?limit=500`)
    const races = data?.RaceTable?.Races
    if (!races || races.length === 0) return []
    return races.map((race: any) => ({
      round: parseInt(race.round),
      name: race.raceName,
      location: race.Circuit?.Location?.locality || '',
      date: race.date,
      results: (race.Results || []).map((r: any) => ({
        pos: parseInt(r.position),
        driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
        team: r.Constructor?.name || '',
        grid: parseInt(r.grid),
        points: parseFloat(r.points),
      })),
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    throw new Error(`Failed to fetch race results: ${msg}`)
  }
}

async function fetchSprintResults(): Promise<RaceResult[]> {
  try {
    const data = await jolpicaFetch(`/${SEASON}/sprint.json?limit=500`)
    const races = data?.SprintTable?.Races || data?.RaceTable?.Races || []
    if (races.length === 0) return []
    return races.map((race: any) => ({
      round: parseInt(race.round),
      name: race.raceName,
      location: race.Circuit?.Location?.locality || '',
      date: race.date,
      results: (race.SprintResults || race.Results || []).map((r: any) => ({
        pos: parseInt(r.position),
        driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
        team: r.Constructor?.name || '',
        points: parseFloat(r.points),
      })),
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    throw new Error(`Failed to fetch sprint results: ${msg}`)
  }
}

async function fetchCalendar(): Promise<CalendarRace[]> {
  try {
    const data = await jolpicaFetch(`/${SEASON}.json`)
    return (data?.RaceTable?.Races || []).map((r: any) => ({
      round: parseInt(r.round),
      name: r.raceName,
      date: r.date,
      location: r.Circuit?.Location?.locality || '',
      country: r.Circuit?.Location?.country || '',
      isSprint: SPRINT_ROUNDS.has(parseInt(r.round)),
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    throw new Error(`Failed to fetch calendar: ${msg}`)
  }
}

async function initializeRacesFromJolpi(): Promise<RaceEntry[]> {
  try {
    const data = await jolpicaFetch(`/${SEASON}.json`)
    const races = data?.RaceTable?.Races || []
    return races.map((r: any) => ({
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

const TEAM_COLORS: Record<string, string> = {
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

const MEDAL: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function getLockTime(raceDateStr: string): Date {
  const raceDay = new Date(`${raceDateStr}T00:00:00Z`)
  const saturday = new Date(raceDay)
  saturday.setUTCDate(raceDay.getUTCDate() - 1)
  saturday.setUTCHours(9, 0, 0, 0)
  return saturday
}

function isRaceLocked(raceDateStr: string): boolean {
  return new Date() >= getLockTime(raceDateStr)
}

function formatCountdown(raceDateStr: string): string | null {
  const diff = getLockTime(raceDateStr).getTime() - Date.now()
  if (diff <= 0) return null
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return `Locks in ${d}d ${h}h`
  if (h > 0) return `Locks in ${h}h ${m}m`
  return `Locks in ${m}m`
}

function raceFantasyScore(pickedNames: string[], raceResults: RaceResultEntry[]): number {
  if (!pickedNames || !raceResults) return 0
  return pickedNames.reduce((sum, name) => {
    const last = name.toLowerCase().split(' ').slice(-1)[0]
    const match = raceResults.find((r) => r.driver?.toLowerCase().includes(last))
    return sum + (match?.points || 0)
  }, 0)
}

function teamColor(name: string): string {
  const key = Object.keys(TEAM_COLORS).find((k) =>
    name?.toLowerCase().includes(k.toLowerCase())
  )
  return key ? TEAM_COLORS[key] : '#888'
}

// ---------------------------------------------------------------------------
// Styles
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
    boxSizing: 'border-box' as const,
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
    boxSizing: 'border-box' as const,
    appearance: 'none' as const,
    cursor: 'pointer' as const,
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
    textTransform: 'uppercase' as const,
    cursor: 'pointer' as const,
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
    textTransform: 'uppercase' as const,
    cursor: 'pointer' as const,
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
    textTransform: 'uppercase' as const,
    color: '#e60000',
  },
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Badge({ rank }: { rank: number }) {
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

function Spinner({ msg }: { msg?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0', color: '#555' }}>
      <div style={{ fontSize: 48, display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</div>
      {msg && <div style={{ marginTop: 14, fontSize: 14 }}>{msg}</div>}
    </div>
  )
}

function Empty({ msg, onAction, actionLabel }: { msg: string; onAction?: () => void; actionLabel?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '70px 0', color: '#555' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
      <div style={{ fontSize: 14, marginBottom: onAction ? 18 : 0 }}>{msg}</div>
      {onAction && <button style={S.btn} onClick={onAction}>{actionLabel}</button>}
    </div>
  )
}

function LockBadge({ raceDateStr }: { raceDateStr: string }) {
  const locked = isRaceLocked(raceDateStr)
  const countdown = formatCountdown(raceDateStr)
  if (locked) {
    return (
      <span style={{
        background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.4)',
        color: '#ff6666', fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
        textTransform: 'uppercase', padding: '4px 10px', borderRadius: 4,
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}>🔒 Picks Locked</span>
    )
  }
  return (
    <span style={{
      background: 'rgba(34,200,100,0.1)', border: '1px solid rgba(34,200,100,0.3)',
      color: '#4dde8a', fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
      textTransform: 'uppercase', padding: '4px 10px', borderRadius: 4,
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>🟢 Open{countdown ? ` · ${countdown}` : ''}</span>
  )
}

// ---------------------------------------------------------------------------
// Race Grid Tab
// ---------------------------------------------------------------------------

interface RaceGridTabProps {
  leagueData: LeagueData
  saveLeagueData: (data: LeagueData) => void
  calendar: CalendarRace[]
  raceResults: RaceResult[]
  sprintResults: RaceResult[]
  loading: boolean
}

function RaceGridTab({ leagueData, saveLeagueData, calendar, raceResults, sprintResults, loading }: RaceGridTabProps) {
  const participants = leagueData?.participants || {}
  const participantList = Object.entries(participants)

  const [selectedRound, setSelectedRound] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [picks, setPicks] = useState<string[]>(['', '', '', '', '', ''])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (calendar.length > 0 && !selectedRound) {
      const upcoming = calendar.find((r) => !isRaceLocked(r.date))
      const target = upcoming || calendar[calendar.length - 1]
      setSelectedRound(String(target.round))
    }
  }, [calendar])

  useEffect(() => {
    if (participantList.length > 0 && !selectedUserId) {
      setSelectedUserId(participantList[0][0])
    }
  }, [participantList.length])

  useEffect(() => {
    if (!selectedRound || !selectedUserId || !leagueData) return
    const savedPicks = leagueData.races?.find((r) => r.id === parseInt(selectedRound))
      ?.participants?.[selectedUserId]?.picks
    if (savedPicks && savedPicks.length > 0) {
      const padded = [...savedPicks]
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
    let updatedRaces: RaceEntry[]
    if (raceIdx >= 0) {
      updatedRaces = existingRaces.map((r, i) => i !== raceIdx ? r : {
        ...r,
        participants: { ...r.participants, [selectedUserId]: { picks: filledPicks } },
      })
    } else {
      const raceInfo = calendar.find((r) => r.round === roundId)
      updatedRaces = [...existingRaces, {
        id: roundId,
        name: raceInfo?.name || `Round ${roundId}`,
        date: raceInfo?.date || '',
        location: raceInfo?.location || '',
        isFinished: raceInfo ? isRaceLocked(raceInfo.date) : false,
        participants: { [selectedUserId]: { picks: filledPicks } },
      }]
    }
    saveLeagueData({ ...leagueData, races: updatedRaces, lastUpdated: new Date().toISOString() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const actualRaceResults = raceResults.find((r) => r.round === parseInt(selectedRound))
  const actualSprintResults = sprintResults.find((r) => r.round === parseInt(selectedRound))

  if (participantList.length === 0) return <Empty msg="No participants set up yet." />
  if (calendar.length === 0 && loading) return <Spinner msg="Loading calendar…" />

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={S.label}>Race-by-Race</div>
        <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>Race Grid Picks</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Set each participant's picks per race. Picks lock Saturday 09:00 UTC. Sprint weekends use the same picks for both events.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ ...S.label, marginBottom: 8 }}>Race</div>
          <div style={{ position: 'relative' }}>
            <select value={selectedRound} onChange={(e) => setSelectedRound(e.target.value)} style={S.select}>
              <option value="">Select a race…</option>
              {calendar.map((r) => (
                <option key={r.round} value={r.round}>
                  R{r.round}{r.isSprint ? ' ⚡' : ''} · {r.name} ({r.date})
                </option>
              ))}
            </select>
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#666', fontSize: 12 }}>▾</div>
          </div>
        </div>
        <div>
          <div style={{ ...S.label, marginBottom: 8 }}>Participant</div>
          <div style={{ position: 'relative' }}>
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={S.select}>
              <option value="">Select participant…</option>
              {participantList.map(([uid, p]) => (
                <option key={uid} value={uid}>{p.name}</option>
              ))}
            </select>
            <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#666', fontSize: 12 }}>▾</div>
          </div>
        </div>
      </div>

      {selectedRace && (
        <div style={{ ...S.card, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{
            background: 'rgba(230,0,0,0.08)', borderBottom: '1px solid rgba(230,0,0,0.15)',
            padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: '#e60000', color: '#fff', fontWeight: 900, fontSize: 11, padding: '4px 10px', borderRadius: 4 }}>
                R{selectedRace.round}
              </div>
              {selectedRace.isSprint && (
                <div style={{
                  background: 'rgba(255,180,0,0.15)', color: '#ffb300',
                  border: '1px solid rgba(255,180,0,0.3)',
                  fontWeight: 700, fontSize: 10, padding: '3px 8px', borderRadius: 4, letterSpacing: 1, textTransform: 'uppercase',
                }}>⚡ Sprint Weekend</div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedRace.name}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{selectedRace.location} · {selectedRace.date}</div>
              </div>
            </div>
            <LockBadge raceDateStr={selectedRace.date} />
          </div>

          <div style={{ padding: 22 }}>
            {locked && (
              <div style={{ background: 'rgba(230,0,0,0.07)', border: '1px solid rgba(230,0,0,0.18)', borderRadius: 6, padding: '10px 16px', fontSize: 13, color: '#ff8888', marginBottom: 18 }}>
                Picks are locked for this race. You can view but not edit.
              </div>
            )}
            {selectedRace.isSprint && (
              <div style={{ background: 'rgba(255,180,0,0.07)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: 6, padding: '10px 16px', fontSize: 13, color: '#ffb300', marginBottom: 18 }}>
                ⚡ These picks score for both the sprint race and the grand prix this weekend.
              </div>
            )}
            <div style={{ ...S.label, marginBottom: 12 }}>
              Driver Picks for {participants[selectedUserId]?.name || '—'} (up to 6)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
              {picks.map((pick, i) => (
                <input
                  key={i} list="f1-drivers-race" placeholder={`Pick ${i + 1}`} value={pick}
                  disabled={locked}
                  onChange={(e) => { const u = [...picks]; u[i] = e.target.value; setPicks(u) }}
                  style={{ ...S.input, opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'text' }}
                />
              ))}
            </div>
            <datalist id="f1-drivers-race">
              {F1_2026_DRIVERS.map((d) => <option key={d} value={d} />)}
            </datalist>
            {!locked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button style={S.btn} onClick={savePicks}>Save Picks</button>
                {saved && <span style={{ fontSize: 12, color: '#4dde8a', letterSpacing: 0.5 }}>✓ Saved</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedRace && participantList.length > 0 && (
        <div>
          <div style={{ ...S.label, marginBottom: 14 }}>All Picks — {selectedRace.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {participantList.map(([uid, p]) => {
              const savedPicks = leagueData.races?.find((r) => r.id === parseInt(selectedRound))?.participants?.[uid]?.picks
              const racePicks = (savedPicks && savedPicks.length > 0) ? savedPicks : p.seasonPicks?.drivers?.map((d) => d.name) || []
              const raceScore = actualRaceResults ? raceFantasyScore(racePicks, actualRaceResults.results) : null
              const sprintScore = actualSprintResults ? raceFantasyScore(racePicks, actualSprintResults.results) : null
              const totalScore = (raceScore ?? 0) + (sprintScore ?? 0)
              const hasScore = raceScore !== null || sprintScore !== null
              const isActive = uid === selectedUserId
              return (
                <div key={uid} onClick={() => setSelectedUserId(uid)} style={{
                  ...S.card, padding: '14px 18px',
                  display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                  border: isActive ? '1px solid rgba(230,0,0,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  background: isActive ? 'rgba(230,0,0,0.06)' : 'rgba(255,255,255,0.03)',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 15, minWidth: 120 }}>{p.name}</div>
                  <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {racePicks.length === 0
                      ? <span style={{ fontSize: 12, color: '#444', fontStyle: 'italic' }}>No picks yet</span>
                      : racePicks.map((d, j) => (
                        <span key={j} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 9px', fontSize: 12, color: '#bbb' }}>{d}</span>
                      ))
                    }
                  </div>
                  {hasScore && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {sprintScore !== null && (
                        <div style={{ fontSize: 11, color: '#ffb300', marginBottom: 2 }}>⚡ {sprintScore} + 🏁 {raceScore}</div>
                      )}
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#ff8800' }}>{totalScore}</div>
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
// League Tab
// ---------------------------------------------------------------------------

interface ScoringEvent {
  round: number
  type: 'sprint' | 'race'
  label: string
  data: RaceResult
}

interface EventBreakdown extends ScoringEvent {
  picks: string[]
  pts: number
  running: number
}

interface LeagueRow {
  uid: string
  name: string
  totalPts: number
  eventBreakdown: EventBreakdown[]
  rank: number
}

interface LeagueTabProps {
  leagueData: LeagueData
  calendar: CalendarRace[]
  raceResults: RaceResult[]
  sprintResults: RaceResult[]
  loading: boolean
}

function LeagueTab({ leagueData, calendar, raceResults, sprintResults, loading }: LeagueTabProps) {
  const participants = leagueData?.participants || {}
  const participantList = Object.entries(participants)
  const [expandedUid, setExpandedUid] = useState<string | null>(null)

  if (participantList.length === 0) return <Empty msg="No participants set up yet." />

  const completedRounds = new Set([
    ...raceResults.map((r) => r.round),
    ...sprintResults.map((r) => r.round),
  ])

  const calendarRounds = calendar.length > 0
    ? calendar.filter((c) => completedRounds.has(c.round))
    : [...completedRounds].sort((a, b) => a - b).map((r) => ({ round: r, isSprint: SPRINT_ROUNDS.has(r), name: '', date: '', location: '', country: '' }))

  const scoringEvents: ScoringEvent[] = []
  calendarRounds.forEach((cal) => {
    const sprint = sprintResults.find((r) => r.round === cal.round)
    const race = raceResults.find((r) => r.round === cal.round)
    if (sprint?.results?.length) scoringEvents.push({ round: cal.round, type: 'sprint', label: `R${cal.round}S`, data: sprint })
    if (race?.results?.length) scoringEvents.push({ round: cal.round, type: 'race', label: `R${cal.round}`, data: race })
  })

  const MAX_COLS = 8
  const visibleEvents = scoringEvents.slice(0, MAX_COLS)
  const colTemplate = `56px 180px repeat(${visibleEvents.length}, 1fr) 90px`

  const leaderboard: LeagueRow[] = participantList.map(([uid, p]) => {
    let cumulativePoints = 0
    const eventBreakdown: EventBreakdown[] = scoringEvents.map((event) => {
      const savedPicks = leagueData.races?.find((r) => r.id === event.round)?.participants?.[uid]?.picks
      const picks = (savedPicks && savedPicks.length > 0) ? savedPicks : p.seasonPicks?.drivers?.map((d) => d.name) || []
      const pts = raceFantasyScore(picks, event.data.results)
      cumulativePoints += pts
      return { ...event, picks, pts, running: cumulativePoints }
    })
    return { uid, name: p.name, totalPts: cumulativePoints, eventBreakdown, rank: 0 }
  })
    .sort((a, b) => b.totalPts - a.totalPts)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={S.label}>Fantasy</div>
        <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>League Table</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Race-by-race fantasy points including sprint races. ⚡ = sprint · 🏁 = race · Click any row for the full breakdown.
        </p>
      </div>

      {loading && scoringEvents.length === 0 ? (
        <Spinner msg="Loading race results…" />
      ) : scoringEvents.length === 0 ? (
        <Empty msg="No completed races yet for the 2026 season." />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: colTemplate, gap: 6, padding: '8px 20px', fontSize: 9, letterSpacing: 2, color: '#555', fontWeight: 700, textTransform: 'uppercase' }}>
            <span>Pos</span>
            <span>Participant</span>
            {visibleEvents.map((ev) => (
              <span key={`${ev.round}-${ev.type}`} style={{ textAlign: 'center', color: ev.type === 'sprint' ? '#ffb300' : '#555' }}>
                {ev.label}
              </span>
            ))}
            <span style={{ textAlign: 'right' }}>Total</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {leaderboard.map((p) => (
              <div key={p.uid}>
                <div
                  onClick={() => setExpandedUid(expandedUid === p.uid ? null : p.uid)}
                  style={{
                    ...S.card,
                    display: 'grid', gridTemplateColumns: colTemplate,
                    gap: 6, alignItems: 'center', padding: '16px 20px', cursor: 'pointer',
                    background: p.rank === 1 ? 'rgba(255,215,0,0.05)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${expandedUid === p.uid ? 'rgba(230,0,0,0.35)' : p.rank === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'border-color 0.15s',
                  }}
                >
                  <Badge rank={p.rank} />
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  {p.eventBreakdown.slice(0, MAX_COLS).map((eb) => (
                    <div key={`${eb.round}-${eb.type}`} style={{ textAlign: 'center' }}>
                      {eb.picks.length === 0
                        ? <span style={{ color: '#383838', fontSize: 13 }}>—</span>
                        : <span style={{ fontSize: 13, fontWeight: 700, color: eb.pts > 0 ? (eb.type === 'sprint' ? '#ffb300' : '#ff8800') : '#555' }}>{eb.pts}</span>
                      }
                    </div>
                  ))}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: p.rank === 1 ? '#FFD700' : '#fff' }}>{p.totalPts}</div>
                    <div style={{ fontSize: 9, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' }}>pts</div>
                  </div>
                </div>

                {expandedUid === p.uid && (
                  <div style={{
                    ...S.card, margin: '2px 0 6px 0',
                    background: 'rgba(230,0,0,0.04)', border: '1px solid rgba(230,0,0,0.2)',
                    borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '18px 22px',
                  }}>
                    <div style={{ ...S.label, marginBottom: 14 }}>Full breakdown — {p.name}</div>
                    {calendarRounds.filter((c) => completedRounds.has(c.round)).map((cal) => {
                      const sprintEv = p.eventBreakdown.find((e) => e.round === cal.round && e.type === 'sprint')
                      const raceEv = p.eventBreakdown.find((e) => e.round === cal.round && e.type === 'race')
                      if (!sprintEv && !raceEv) return null
                      const roundTotal = (sprintEv?.pts || 0) + (raceEv?.pts || 0)
                      const displayPicks = (raceEv || sprintEv)?.picks || []
                      return (
                        <div key={cal.round} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ background: '#e60000', color: '#fff', fontWeight: 900, fontSize: 10, padding: '3px 8px', borderRadius: 3 }}>R{cal.round}</div>
                            <div style={{ fontSize: 13, color: '#888' }}>
                              {(raceEv || sprintEv)?.data?.name}
                              {cal.isSprint && <span style={{ color: '#ffb300', marginLeft: 6 }}>⚡ Sprint Weekend</span>}
                            </div>
                            <div style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 900, color: '#ff8800' }}>{roundTotal} pts</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                            {displayPicks.length === 0
                              ? <span style={{ fontSize: 12, color: '#444', fontStyle: 'italic' }}>No picks entered</span>
                              : displayPicks.map((d, j) => (
                                <span key={j} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 9px', fontSize: 12, color: '#bbb' }}>{d}</span>
                              ))
                            }
                          </div>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {sprintEv && (
                              <div style={{ background: 'rgba(255,180,0,0.07)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, color: '#ffb300', fontWeight: 700, letterSpacing: 1 }}>⚡ SPRINT</span>
                                <span style={{ fontSize: 18, fontWeight: 900, color: '#ffb300' }}>{sprintEv.pts}</span>
                                <span style={{ fontSize: 10, color: '#666' }}>pts</span>
                                <span style={{ fontSize: 10, color: '#555', marginLeft: 4 }}>({sprintEv.running - (raceEv?.pts || 0)} running after sprint)</span>
                              </div>
                            )}
                            {raceEv && (
                              <div style={{ background: 'rgba(255,136,0,0.07)', border: '1px solid rgba(255,136,0,0.2)', borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, color: '#ff8800', fontWeight: 700, letterSpacing: 1 }}>🏁 RACE</span>
                                <span style={{ fontSize: 18, fontWeight: 900, color: '#ff8800' }}>{raceEv.pts}</span>
                                <span style={{ fontSize: 10, color: '#666' }}>pts</span>
                                <span style={{ fontSize: 10, color: '#555', marginLeft: 4 }}>({raceEv.running} running total)</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {scoringEvents.length > MAX_COLS && (
            <div style={{ fontSize: 11, color: '#555', marginTop: 12, textAlign: 'center' }}>
              Showing first {MAX_COLS} events in grid · click any row for the full breakdown
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
  const [formPicks, setFormPicks] = useState<string[]>(['', '', '', '', '', ''])
  const [editUserId, setEditUserId] = useState<string | null>(null)

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [races, setRaces] = useState<RaceResult[]>([])
  const [sprints, setSprints] = useState<RaceResult[]>([])
  const [calendar, setCalendar] = useState<CalendarRace[]>([])
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState<string | null>(null)
  const didFetch = useRef(false)
  const didInitRaces = useRef(false)

  const { leagueData, loading: leagueLoading, error: leagueError, save: saveLeagueData } = useLeagueData()

  useEffect(() => {
    if (!leagueData || didInitRaces.current) return
    if (leagueData.races.length > 0) {
      didInitRaces.current = true
      return
    }
    didInitRaces.current = true
    initializeRacesFromJolpi().then((newRaces) => {
      if (newRaces.length === 0) return
      saveLeagueData({ ...leagueData, races: newRaces, lastUpdated: new Date().toISOString() })
    })
  }, [leagueData, saveLeagueData])

  // -------------------------------------------------------------------------
  // Participant CRUD
  // -------------------------------------------------------------------------

  function saveParticipant() {
    if (!formName.trim() || !leagueData) return
    const picks = formPicks.filter((p) => p.trim())
    if (editUserId !== null) {
      saveLeagueData({
        ...leagueData,
        participants: {
          ...leagueData.participants,
          [editUserId]: {
            ...leagueData.participants[editUserId],
            name: formName.trim(),
            seasonPicks: {
              ...leagueData.participants[editUserId].seasonPicks,
              drivers: picks.map((name) => ({ id: name, name, team: '' })),
            },
          },
        },
        lastUpdated: new Date().toISOString(),
      })
      setEditUserId(null)
    } else {
      const userId = `user_${Date.now()}`
      saveLeagueData({
        ...leagueData,
        participants: {
          ...leagueData.participants,
          [userId]: {
            name: formName.trim(),
            seasonPicks: { drivers: picks.map((name) => ({ id: name, name, team: '' })), teams: [] },
          },
        },
        lastUpdated: new Date().toISOString(),
      })
    }
    setFormName('')
    setFormPicks(['', '', '', '', '', ''])
  }

  function startEdit(userId: string) {
    const p = leagueData?.participants[userId]
    if (!p) return
    setEditUserId(userId)
    setFormName(p.name)
    const picks = p.seasonPicks.drivers.map((d) => d.name)
    while (picks.length < 6) picks.push('')
    setFormPicks(picks)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditUserId(null)
    setFormName('')
    setFormPicks(['', '', '', '', '', ''])
  }

  function removeParticipant(userId: string) {
    if (!leagueData) return
    const { [userId]: _, ...remaining } = leagueData.participants
    saveLeagueData({ ...leagueData, participants: remaining, lastUpdated: new Date().toISOString() })
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
      setCalendar(await fetchCalendar())

      setLoadMsg('Fetching driver standings…')
      setDrivers(await fetchDriverStandings())

      setLoadMsg('Fetching constructor standings…')
      setTeams(await fetchConstructorStandings())

      setLoadMsg('Fetching race results…')
      setRaces(await fetchRaceResults())

      setLoadMsg('Fetching sprint results…')
      setSprints(await fetchSprintResults())

      setUpdated(new Date().toLocaleTimeString())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(`Could not load live data from Jolpica F1 API. (${msg})`)
    }
    setLoading(false)
    setLoadMsg('')
  }

  function refresh() {
    didFetch.current = true
    doFetch()
  }

  const TABS = [
    { id: 'setup',     label: '⚙ Setup' },
    { id: 'league',    label: '🏆 League' },
    { id: 'racegrid',  label: '🎯 Race Grid' },
    { id: 'races',     label: '🏁 Races' },
    { id: 'standings', label: '📊 Standings' },
  ]

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

  return (
    <div style={{
      minHeight: '100vh', background: '#0b0b10', color: '#e8e8f0',
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

      <header style={{ background: 'rgba(0,0,0,0.85)', borderBottom: '2px solid #e60000', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'stretch' }}>
          <div style={{
            background: '#e60000', padding: '14px 36px 14px 20px',
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
                padding: '20px 16px 17px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'inherit',
                transition: 'color 0.15s', whiteSpace: 'nowrap',
              }}>{t.label}</button>
            ))}
          </nav>
          {tab !== 'setup' && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flexShrink: 0 }}>
              {updated && !loading && <span style={{ fontSize: 10, color: '#555', letterSpacing: 0.5 }}>Updated {updated}</span>}
              <button onClick={refresh} disabled={loading} style={{ ...S.ghost, borderColor: 'rgba(230,0,0,0.4)', color: loading ? '#444' : '#e60000' }}>
                {loading ? '…' : '↻ Refresh'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px' }}>
        {(error || leagueError) && (
          <div style={{ background: 'rgba(230,0,0,0.1)', border: '1px solid rgba(230,0,0,0.3)', borderRadius: 6, padding: '12px 18px', marginBottom: 24, fontSize: 13, color: '#ff8888', lineHeight: 1.5 }}>
            {error || leagueError}
          </div>
        )}

        {/* Setup */}
        {tab === 'setup' && (
          <div>
            <div style={{ marginBottom: 36 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 42, fontWeight: 900, margin: '6px 0 8px', letterSpacing: -0.5 }}>League Setup</h1>
              <p style={{ color: '#666', fontSize: 14, lineHeight: 1.5 }}>
                Add participants and assign up to 6 drivers as their default picks.<br />
                Use the Race Grid tab to override picks for individual races.
              </p>
            </div>

            <div style={{ ...S.card, padding: 26, marginBottom: 28 }}>
              <div style={{ ...S.label, marginBottom: 16 }}>{editUserId !== null ? '✎ Edit Participant' : '＋ Add Participant'}</div>
              <input
                placeholder="Participant name…" value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveParticipant()}
                style={{ ...S.input, marginBottom: 14 }}
              />
              <div style={{ ...S.label, marginBottom: 10 }}>Default Driver Picks (up to 6)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                {formPicks.map((pick, i) => (
                  <input
                    key={i} list="f1-drivers" placeholder={`Pick ${i + 1}`} value={pick}
                    onChange={(e) => { const u = [...formPicks]; u[i] = e.target.value; setFormPicks(u) }}
                    style={S.input}
                  />
                ))}
              </div>
              <datalist id="f1-drivers">
                {F1_2026_DRIVERS.map((d) => <option key={d} value={d} />)}
              </datalist>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={S.btn} onClick={saveParticipant}>{editUserId !== null ? 'Save Changes' : 'Add Participant'}</button>
                {editUserId !== null && <button style={S.ghost} onClick={cancelEdit}>Cancel</button>}
              </div>
            </div>

            {Object.keys(leagueData.participants).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: '#444', fontSize: 14 }}>No participants yet – add your first one above.</div>
            ) : (
              <>
                <div style={{ ...S.label, marginBottom: 12 }}>
                  {Object.keys(leagueData.participants).length} Participant{Object.keys(leagueData.participants).length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(Object.entries(leagueData.participants) as [string, Participant][]).map(([userId, p], i) => (
                    <div key={userId} style={{
                      ...S.card, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
                      border: editUserId === userId ? '1px solid rgba(230,0,0,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ width: 36, height: 36, background: '#e60000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{p.name}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {p.seasonPicks.drivers.map((d, j) => (
                            <span key={j} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 10px', fontSize: 12, color: '#ccc' }}>{d.name}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={S.ghost} onClick={() => startEdit(userId)}>Edit</button>
                        <button style={{ ...S.ghost, color: '#e60000', borderColor: 'rgba(230,0,0,0.3)' }} onClick={() => removeParticipant(userId)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 28, textAlign: 'center' }}>
                  <button style={{ ...S.btn, padding: '14px 48px', fontSize: 15 }} onClick={() => setTab('league')}>View League Table →</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* League */}
        {tab === 'league' && (
          <LeagueTab leagueData={leagueData} calendar={calendar} raceResults={races} sprintResults={sprints} loading={loading} />
        )}

        {/* Race Grid */}
        {tab === 'racegrid' && (
          loading && calendar.length === 0
            ? <Spinner msg={loadMsg} />
            : <RaceGridTab leagueData={leagueData} saveLeagueData={saveLeagueData} calendar={calendar} raceResults={races} sprintResults={sprints} loading={loading} />
        )}

        {/* Races */}
        {tab === 'races' && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>Race Results</h1>
            </div>
            {loading ? <Spinner msg={loadMsg} /> : races.length === 0 ? (
              <Empty msg="No completed races yet for the 2026 season." onAction={refresh} actionLabel="Try Refreshing" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[...races].reverse().map((race) => {
                  const sprint = sprints.find((s) => s.round === race.round)
                  return (
                    <div key={race.round} style={{ ...S.card, overflow: 'hidden' }}>
                      <div style={{ background: 'rgba(230,0,0,0.1)', borderBottom: '1px solid rgba(230,0,0,0.2)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ background: '#e60000', color: '#fff', fontWeight: 900, fontSize: 11, padding: '4px 10px', borderRadius: 4 }}>R{race.round}</div>
                        {sprint && <div style={{ background: 'rgba(255,180,0,0.15)', color: '#ffb300', border: '1px solid rgba(255,180,0,0.3)', fontWeight: 700, fontSize: 10, padding: '3px 8px', borderRadius: 4 }}>⚡ Sprint</div>}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{race.name}</div>
                          <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>{race.location} · {race.date}</div>
                        </div>
                      </div>

                      {sprint?.results?.length > 0 && (
                        <div style={{ padding: '0 20px 16px', borderBottom: '1px solid rgba(255,180,0,0.1)' }}>
                          <div style={{ ...S.label, color: '#ffb300', margin: '14px 0 10px' }}>⚡ Sprint Result</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 70px', gap: 10, padding: '0 0 8px', fontSize: 9, letterSpacing: 1.5, color: '#555', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <span>Pos</span><span>Driver</span><span>Team</span><span style={{ textAlign: 'right' }}>Pts</span>
                          </div>
                          {sprint.results.map((r, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 70px', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <Badge rank={r.pos} />
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.driver}</div>
                              <div style={{ fontSize: 13, color: '#777' }}>{r.team}</div>
                              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: r.points > 0 ? '#ffb300' : '#555' }}>{r.points}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ padding: '0 20px 16px' }}>
                        <div style={{ ...S.label, margin: '14px 0 10px' }}>🏁 Race Result</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px 70px', gap: 10, padding: '0 0 8px', fontSize: 9, letterSpacing: 1.5, color: '#555', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span>Pos</span><span>Driver</span><span>Team</span><span style={{ textAlign: 'center' }}>Grid</span><span style={{ textAlign: 'right' }}>Pts</span>
                        </div>
                        {(race.results || []).map((r, i) => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px 70px', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <Badge rank={r.pos} />
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.driver}</div>
                            <div style={{ fontSize: 13, color: '#777' }}>{r.team}</div>
                            <div style={{ textAlign: 'center', fontSize: 13, color: '#666' }}>P{r.grid}</div>
                            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: r.points > 0 ? '#ff8800' : '#555' }}>{r.points}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Standings */}
        {tab === 'standings' && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: '6px 0', letterSpacing: -0.5 }}>Championship Standings</h1>
            </div>
            {loading ? <Spinner msg={loadMsg} /> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
                <div>
                  <div style={{ ...S.label, marginBottom: 12 }}>🏎 Drivers Championship</div>
                  {drivers.length === 0
                    ? <div style={{ color: '#555', fontSize: 13, padding: '20px 0' }}>No data yet – try refreshing.</div>
                    : (
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
                  {teams.length === 0
                    ? <div style={{ color: '#555', fontSize: 13, padding: '20px 0' }}>No data yet – try refreshing.</div>
                    : (
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
