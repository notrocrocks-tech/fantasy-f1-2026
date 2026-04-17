export interface Driver {
  id: string
  number: number
  name: string
  team: string
}

export interface Team {
  id: string
  name: string
  constructorRef: string
}

export interface RaceParticipantPicks {
  drivers: Driver[]
  teams: Team[]
  locked: boolean
  score: number
}

export interface Race {
  id: number
  name: string
  date: string
  location: string
  circuit: string
  isFinished: boolean
  participants: {
    [userId: string]: RaceParticipantPicks
  }
  results?: {
    drivers: Array<{ id: string; position: number }>
    teams: Array<{ id: string; position: number }>
  }
}

export interface SeasonPicks {
  drivers: Driver[]
  teams: Team[]
}

export interface Participant {
  name: string
  seasonPicks: SeasonPicks
}

export interface Leaderboard {
  [userId: string]: {
    totalPoints: number
    byRace: {
      [raceId: string]: number
    }
  }
}

export interface LeagueData {
  season: number
  participants: {
    [userId: string]: Participant
  }
  races: Race[]
  leaderboard: Leaderboard
  lastUpdated: string
}

export interface JolpiRace {
  round: number
  raceName: string
  date: string
  time: string
  circuit: {
    circuitId: string
    circuitName: string
    location: {
      lat: string
      long: string
      locality: string
      country: string
    }
  }
}

export interface JolpiDriver {
  driverId: string
  permanentNumber: string
  code: string
  givenName: string
  familyName: string
  dateOfBirth: string
  nationality: string
}

export interface JolpiConstructor {
  constructorId: string
  name: string
  nationality: string
}

export interface JolpiResult {
  position: string
  points: string
  driver: { driverId: string; permanentNumber: string }
  constructor: { constructorId: string }
}
