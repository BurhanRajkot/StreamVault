import { describe, expect, it } from 'bun:test'
import { findSessionFile, matchRace, normalizeName, readF1Release, readRound, readSessions, searchNames, type RaceToMatch } from './f1Names'

const GB = 1024 ** 3

describe('normalizeName', () => {
  it('drops accents and punctuation, and splits joined words', () => {
    expect(normalizeName('Formula.1.2023.Round.04.AzerbaijanGP.Sprint')).toBe('formula 1 2023 round 04 azerbaijan gp sprint')
    expect(normalizeName('São Paulo Grand Prix')).toBe('sao paulo grand prix')
    expect(normalizeName('Formula.1.2022.Round.22.AbuDhabiGP.Race')).toBe('formula 1 2022 round 22 abu dhabi gp race')
  })
})

describe('readSessions', () => {
  it('reads the session a release names', () => {
    expect(readSessions('formula1 2025 canadian grand prix practice three 720p WEB H264-JFF').sessions).toEqual(['fp3'])
    expect(readSessions('Formula1 2021 Monaco Grand Prix Qualifying 1080p50 HDTV DD2.0 x264-wAm').sessions).toEqual(['qualifying'])
    expect(readSessions('Formula.1.2022.Round.21.BrazilianGP.Sao.Paulo.Brazil.Practice.1.International.F1TV').sessions).toEqual(['fp1'])
    expect(readSessions('F1.Spanish.GP.2009.Friday.Practice.01.DaRmEtH.mkv').sessions).toEqual(['fp1'])
    expect(readSessions('F1.Turkish.GP.2009.Saturday.Practice.DaRmEtH.mkv').sessions).toEqual(['fp3'])
  })

  it('reads sprint qualifying apart from the sprint — and 2021, when "Sprint Qualifying" was the sprint', () => {
    expect(readSessions('Formula.1.2023.Round.04.AzerbaijanGP.Sprint.Shootout.International').sessions).toEqual(['sprint-qualifying'])
    expect(readSessions('Formula 1 2026 Netherlands Sprint Qual R12 2160P').sessions).toEqual(['sprint-qualifying'])
    expect(readSessions('Formula1.2023.Qatar.Grand.Prix.Sprint.Race.1080p.WEB.h264-VERUM').sessions).toEqual(['sprint'])
    expect(readSessions('Formula1 2021 British Grand Prix Sprint Qualifying 1080p50', { year: 2021 }).sessions).toEqual(['sprint'])
  })

  it('takes a name with no session in it for the race', () => {
    expect(readSessions('formula1 2025 abu dhabi grand prix 720p WEB H264-JFF', { sizeBytes: 3 * GB })).toEqual({ sessions: ['race'], pack: false })
    expect(readSessions('Formula1.2023.Bahrain.Grand.Prix.1080p.WEB.h264-VERUM[TGx]').sessions).toEqual(['race'])
  })

  it('takes a huge torrent with no session in its name for the whole weekend', () => {
    const read = readSessions('F1.2026.R18.United.States.Grand.Prix.SkyUHD.2160P', { sizeBytes: 77 * GB })
    expect(read.pack).toBe(true)
    expect(read.sessions).toContain('race')
    expect(read.sessions).toContain('qualifying')
  })

  it('reads every session of a combined torrent', () => {
    expect(readSessions('Formula 1 2015 Brazil Qualifying + Race 720p HD 50fps')).toEqual({ sessions: ['qualifying', 'race'], pack: true })
    expect(readSessions('Formula 1 2019 Monaco Practice 1+2 1080p HD').sessions).toEqual(['fp1', 'fp2'])
    expect(readSessions('Formula 1 2012 Australian Grand Prix Full Weekend 1080i HD (P1, P2, P3, Quali, Race)').sessions).toEqual([
      'fp1',
      'fp2',
      'fp3',
      'qualifying',
      'race',
    ])
  })

  it('finds no session in a show around one', () => {
    expect(readSessions('Formula.1.2026.Brazil.Pre.Race.Show.1080p.SS').sessions).toEqual([])
    expect(readSessions('Formula 1 2012 R08 European Grand Prix BBC Post Race Forum').sessions).toEqual([])
    expect(readSessions('Formula.1.2014.Australian.GP.Qualifying.Highlights.BBC.x264-SM').sessions).toEqual([])
    expect(readSessions('formula1 2026 canadian grand prix weekend warm up 720p WEB H264-JFF').sessions).toEqual([])
    expect(readSessions('Formula1.2014.Australian.Grand.Prix.Team.Principals.Press.Confer').sessions).toEqual([])
    expect(readSessions('Formula 1 2011 Race 15 Japanese BBC F1 Forum').sessions).toEqual([])
  })

  it("doesn't guess which practice an unnumbered one is", () => {
    expect(readSessions('F1 Australian Grand Prix 2008 Practice Speed TV').sessions).toEqual([])
  })
})

describe('readRound', () => {
  it('reads the round in its usual spellings', () => {
    expect(readRound('F1.2026.R05.Canadian.Grand.Prix.SkyUHD.2160P')).toBe(5)
    expect(readRound('Formula.1.2023.Round.16.SingaporeGP.Race')).toBe(16)
    expect(readRound('Formula 1 - 2008-11-02 - Round 18 - Brazil (Race)')).toBe(18)
    expect(readRound('Formula1 2021 Monaco Grand Prix Race 1080p50')).toBeNull()
  })
})

const race = (round: number, name: string, country: string, locality: string): RaceToMatch => ({ round, name, country, locality })

const SEASON_2020 = [
  race(1, 'Austrian Grand Prix', 'Austria', 'Spielberg'),
  race(2, 'Styrian Grand Prix', 'Austria', 'Spielberg'),
  race(4, 'British Grand Prix', 'UK', 'Silverstone'),
  race(5, '70th Anniversary Grand Prix', 'UK', 'Silverstone'),
  race(15, 'Bahrain Grand Prix', 'Bahrain', 'Sakhir'),
  race(16, 'Sakhir Grand Prix', 'Bahrain', 'Sakhir'),
  race(17, 'Abu Dhabi Grand Prix', 'UAE', 'Abu Dhabi'),
]

const SEASON_2009 = [
  race(1, 'Australian Grand Prix', 'Australia', 'Melbourne'),
  race(5, 'Spanish Grand Prix', 'Spain', 'Montmeló'),
  race(12, 'Belgian Grand Prix', 'Belgium', 'Spa'),
]

describe('matchRace', () => {
  it('tells apart two races in one country by their own names', () => {
    expect(matchRace('Formula1 2020 Sakhir Grand Prix Race 1080p50', SEASON_2020)?.round).toBe(16)
    expect(matchRace('Formula1.2020.Bahrain.Grand.Prix.720p.WEB.h264-VERUM', SEASON_2020)?.round).toBe(15)
    expect(matchRace('Formula1 2020 Styrian Grand Prix Qualifying', SEASON_2020)?.round).toBe(2)
    expect(matchRace('Formula1 2020 70th Anniversary Grand Prix Race', SEASON_2020)?.round).toBe(5)
  })

  it('knows the other names a race goes by', () => {
    expect(matchRace('Formula 1 2020 Austria Qualifying + Race 720p', SEASON_2020)?.round).toBe(1)
    expect(matchRace('Formula.1.2020.Round.17.AbuDhabiGP.Race.F1TV', SEASON_2020)?.round).toBe(17)
  })

  it('takes a language for the commentary, not the race, unless "Grand Prix" follows', () => {
    expect(matchRace('Formula.1.-.GP.Australia.2009.[Spanish].PDTV.XviD', SEASON_2009)?.round).toBe(1)
    expect(matchRace('F1.GP.Belgica.2009[DVB][Spanish]', SEASON_2009)).toBeNull()
    expect(matchRace('F1.Spanish.GP.2009.Race.DaRmEtH.mkv', SEASON_2009)?.round).toBe(5)
  })

  it('goes by the round number when the name gives nothing else', () => {
    expect(matchRace('F1.2020.R04.SkyF1HD.1080P', SEASON_2020)?.round).toBe(4)
  })

  it('names nothing for a release of no race', () => {
    expect(matchRace('Formula 1 Drive to Survive S07E02', SEASON_2020)).toBeNull()
  })
})

describe('searchNames', () => {
  it("searches by the race's own name and the country it's called by", () => {
    expect(searchNames(race(19, 'São Paulo Grand Prix', 'Brazil', 'São Paulo'))).toEqual(['sao paulo', 'brazil'])
    expect(searchNames(race(24, 'Abu Dhabi Grand Prix', 'UAE', 'Abu Dhabi'))).toEqual(['abu dhabi'])
  })
})

describe('readF1Release', () => {
  it('reads a broadcast of the season', () => {
    expect(readF1Release('Formula1 2021 Bahrain Grand Prix Race 1080p50 HDTV DD2.0 x264-wAm', 2021, 5 * GB)).toEqual({
      sessions: ['race'],
      pack: false,
      round: null,
    })
  })

  it("passes over what isn't a race broadcast of that season", () => {
    expect(readF1Release('F1 The Movie 2025 1080p WEB-DL HEVC x265 5.1 BONE', 2025, 3 * GB)).toBeNull()
    expect(readF1Release('F1 2020-PLAZA', 2020, 35 * GB)).toBeNull()
    expect(readF1Release('Formula 1 - F1 Season 2021 - Mp4 x264 AC3 1080p50', 2021, 142 * GB)).toBeNull()
    expect(readF1Release('Formula1 2021 Bahrain Grand Prix Race 1080p50', 2022, 5 * GB)).toBeNull()
    expect(readF1Release('Formula1.2014.Japan.Race.DANISH.720p.x264', 2014, 3 * GB)).toBeNull()
    expect(readF1Release('F1 Monaco Grand Prix Race 2010 PL [BTK]', 2010, 2 * GB)).toBeNull()
  })
})

describe('findSessionFile', () => {
  const f = (path: string, bytes: number) => ({ path, bytes })
  it("picks the session's own file out of a combined torrent", () => {
    const files = [f('Formula 1 2015 Brazil Qualifying 720p.mkv', 6), f('Formula 1 2015 Brazil Race 720p.mkv', 9)]
    expect(findSessionFile(files, 'qualifying')?.bytes).toBe(6)
    expect(findSessionFile(files, 'race')?.bytes).toBe(9)
  })

  it('takes a "Sprint Qualifying" file for 2021\'s sprint', () => {
    expect(findSessionFile([f('Sprint Qualifying.mkv', 3), f('Race.mkv', 9)], 'sprint')?.bytes).toBe(3)
  })
})
