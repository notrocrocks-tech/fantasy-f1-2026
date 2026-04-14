import { useState, useEffect, useCallback } from 'react'
import type { LeagueData, Participant } from '../types/league'

const JSONBIN_KEY = '$2a$10$yaWrWisPy3gPvWb97giaDOxuUXi4Lu5WcgZNmE9RbdkodPC3GY6zi'
const JSONBIN_ID = '69cbd016aaba882197af566e'

export function useLeagueData() {
  const [leagueData, setLeagueData] = useState<LeagueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (!JSONBIN_KEY || !JSONBIN_ID) {
        throw new Error('JSONBin credentials not configured')
      }

      const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_KEY },
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const record = data?.record as LeagueData | null

      if (record && record.season && record.participants && record.races !== undefined) {
        setLeagueData(record)
      } else if (record && 'participants' in record && Array.isArray(record.participants)) {
        const migrated = migrateOldSchema(record.participants as Array<{ name: string; picks: string[] }>)
        setLeagueData(migrated)
      } else {
        throw new Error('Invalid schema')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load league data')
      setLeagueData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async (data: LeagueData) => {
    if (!JSONBIN_KEY || !JSONBIN_ID) return

    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': JSONBIN_KEY,
        },
        body: JSON.stringify(data),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      setLeagueData(data)
    } catch (e) {
      console.error('Failed to save league data:', e)
      throw e
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return {
    leagueData,
    loading,
    error,
    save,
    refresh: load,
  }
}

function migrateOldSchema(oldParticipants: Array<{ name: string; picks: string[] }>): LeagueData {
  const newParticipants: { [key: string]: Participant } = {}

  oldParticipants.forEach((p, i) => {
    const id = `user_${i}`
    newParticipants[id] = {
      name: p.name,
      seasonPicks: {
        drivers: p.picks.map(name => ({ id: name, name, team: '' })),
        teams: [],
      },
    }
  })

  return {
    season: 2026,
    participants: newParticipants,
    races: [],
    leaderboard: {},
    lastUpdated: new Date().toISOString(),
  }
}
