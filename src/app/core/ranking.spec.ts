import { AllTimeScore, WeeklyScore } from './models';
import { rankAllTime, rankWeekly } from './ranking';

function weekly(playerName: string, score: number, createdAt: string): WeeklyScore {
  return {
    quizId: 'q1',
    weekId: '529',
    playerId: playerName,
    playerName,
    score,
    total: 10,
    createdAt,
  };
}

function allTime(playerName: string, totalScore: number): AllTimeScore {
  return { playerId: playerName, playerName, totalScore, totalPossible: 30, quizzesPlayed: 3 };
}

describe('rankWeekly', () => {
  it('orders by score and gives tied players the same rank', () => {
    const ranked = rankWeekly([
      weekly('Ann', 7, '2026-11-13T10:00:00Z'),
      weekly('Bob', 9, '2026-11-13T11:00:00Z'),
      weekly('Cat', 7, '2026-11-13T09:00:00Z'),
      weekly('Dan', 5, '2026-11-13T08:00:00Z'),
    ]);
    expect(ranked.map((row) => [row.entry.playerName, row.rank])).toEqual([
      ['Bob', 1],
      ['Cat', 2],
      ['Ann', 2],
      ['Dan', 4],
    ]);
  });

  it('returns an empty list for no scores', () => {
    expect(rankWeekly([])).toEqual([]);
  });
});

describe('rankAllTime', () => {
  it('orders by total score then name', () => {
    const ranked = rankAllTime([allTime('Zed', 20), allTime('Amy', 20), allTime('Bo', 25)]);
    expect(ranked.map((row) => [row.entry.playerName, row.rank])).toEqual([
      ['Bo', 1],
      ['Amy', 2],
      ['Zed', 2],
    ]);
  });
});
