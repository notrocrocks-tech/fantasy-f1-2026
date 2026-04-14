import type { Race, LeagueData, Driver, Team } from '../types/league'

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]

export const getRaceLockTime = (raceDate: string): Date => {
  const race = new Date(raceDate)
  let dayOfWeek = race.getDay()
  
  let daysBack = 0
  if (dayOfWeek === 5) {
    daysBack = 0
  } else if (dayOfWeek > 5 || dayOfWeek === 0) {
    daysBack = (dayOfWeek === 0 ? 2 : dayOfWeek - 5)
  } else {
    daysBack = dayOfWeek + 2
  }
  
  const lockDate = new Date(race)
  lockDate.setDate(lockDate.getDate() - daysBack)
  lockDate.setHours(9, 0, 0, 0)
  
  return lockDate
}

export const isRaceLocked = (raceDate: string): boolean => {
  return new Date() >= getRaceLockTime(raceDate)
}

export const getTimeUntilLock = (raceDate: string): string => {
  const lockTime = getRaceLockTime(raceDate)
  const now = new Date()
  const diff = lockTime.getTime() - now.getTime()
  
  if (diff <= 0) return 'LOCKED'
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  
  if (days > 0) return `${days}d ${hours}h until lock`
  if (hours > 0) return `${hours}h ${mins}m until lock`
  return `${mins}m until lock`
}

export const getDefaultPicksIfLocked = (
  userId: string,
  race: Race,
  leagueData: LeagueData
): { drivers: Driver[]; teams: Team[] } => {
  const userRacePicks = race.participants[userId]
  
  if (userRacePicks && userRacePicks.locked && userRacePicks.drivers.length === 0) {
    return leagueData.participants[userId]?.seasonPicks || { drivers: [], teams: [] }
  }
  
  return {
    drivers: userRacePicks?.drivers || [],
    teams: userRacePicks?.teams || [],
  }
}

export const calculateRaceScore = (
  userPickedDrivers: Driver[],
  userPickedTeams: Team[],
  raceResults: { drivers: Array<{ id: string; position: number }>; teams: Array<{ id: string; position: number }> }
): number => {
  let score = 0
  
  userPickedDrivers.forEach(driver => {
    const result = raceResults.drivers.find(r => r.id === driver.id)
    if (result && result.position >= 1 && result.position <= 10) {
      score += F1_POINTS[result.position - 1]
    }
  })
  
  userPickedTeams.forEach(team => {
    const result = raceResults.teams.find(r => r.id === team.id)
    if (result && result.position >= 1 && result.position <= 10) {
      score += F1_POINTS[result.position - 1]
    }
  })
  
  return score
}

export const updateLeaderboardFromRace = (leagueData: LeagueData, race: Race): void => {
  if (!race.isFinished || !race.results) return
  
  Object.entries(race.participants).forEach(([userId, picks]) => {
    if (!leagueData.leaderboard[userId]) {
      leagueData.leaderboard[userId] = {
        totalPoints: 0,
        byRace: {},
      }
    }
    
    const userPicks = getDefaultPicksIfLocked(userId, race, leagueData)
    const score = calculateRaceScore(userPicks.drivers, userPicks.teams, race.results!)
    
    leagueData.leaderboard[userId].byRace[race.id] = score
    
    leagueData.leaderboard[userId].totalPoints = Object.values(leagueData.leaderboard[userId].byRace).reduce(
      (sum, pts) => sum + pts,
      0
    )
  })
}

export const formatLockTime = (raceDate: string): string => {
  const lockTime = getRaceLockTime(raceDate)
  return lockTime.toLocaleString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}
