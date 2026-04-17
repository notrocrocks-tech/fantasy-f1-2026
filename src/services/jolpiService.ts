import type { JolpiRace, JolpiDriver, JolpiConstructor, JolpiResult } from '../types/league'

const JOLPI_BASE = 'https://api.jolpi.ca/ergast/f1'
const SEASON = 2026

export const jolpiService = {
  async getCalendar(): Promise<JolpiRace[]> {
    try {
      const res = await fetch(`${JOLPI_BASE}/${SEASON}.json`)
      if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`)
      
      const data = await res.json()
      return data.MRData.RaceTable.Races || []
    } catch (error) {
      console.error('Failed to fetch F1 calendar:', error)
      return []
    }
  },

  async getDrivers(): Promise<JolpiDriver[]> {
    try {
      const res = await fetch(`${JOLPI_BASE}/${SEASON}/drivers.json`)
      if (!res.ok) throw new Error(`Drivers fetch failed: ${res.status}`)
      
      const data = await res.json()
      return data.MRData.DriverTable.Drivers || []
    } catch (error) {
      console.error('Failed to fetch drivers:', error)
      return []
    }
  },

  async getConstructors(): Promise<JolpiConstructor[]> {
    try {
      const res = await fetch(`${JOLPI_BASE}/${SEASON}/constructors.json`)
      if (!res.ok) throw new Error(`Constructors fetch failed: ${res.status}`)
      
      const data = await res.json()
      return data.MRData.ConstructorTable.Constructors || []
    } catch (error) {
      console.error('Failed to fetch constructors:', error)
      return []
    }
  },

  async getRaceResults(round: number): Promise<JolpiResult[]> {
    try {
      const res = await fetch(`${JOLPI_BASE}/${SEASON}/${round}/results.json`)
      if (!res.ok) throw new Error(`Results fetch failed: ${res.status}`)
      
      const data = await res.json()
      const races = data.MRData.RaceTable.Races
      
      if (!races || races.length === 0) return []
      
      return races[0].Results || []
    } catch (error) {
      console.error(`Failed to fetch results for round ${round}:`, error)
      return []
    }
  },

  isRaceFinished(raceDate: string): boolean {
    const raceDateTime = new Date(raceDate)
    raceDateTime.setHours(14, 0, 0, 0)
    return new Date() > raceDateTime
  },
}
