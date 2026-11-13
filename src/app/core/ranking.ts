import { AllTimeScore, RankedEntry, WeeklyScore } from './models';

export function rankWeekly(scores: WeeklyScore[]): RankedEntry<WeeklyScore>[] {
  const sorted = [...scores].sort(
    (a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt),
  );
  return assignRanks(sorted, (entry) => entry.score);
}

export function rankAllTime(scores: AllTimeScore[]): RankedEntry<AllTimeScore>[] {
  const sorted = [...scores].sort(
    (a, b) => b.totalScore - a.totalScore || a.playerName.localeCompare(b.playerName),
  );
  return assignRanks(sorted, (entry) => entry.totalScore);
}

function assignRanks<T>(sorted: T[], points: (entry: T) => number): RankedEntry<T>[] {
  return sorted.map((entry, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const tied = previous !== null && points(previous) === points(entry);
    const rank = tied ? findRank(sorted, index - 1, points) : index + 1;
    return { rank, entry };
  });
}

function findRank<T>(sorted: T[], index: number, points: (entry: T) => number): number {
  let first = index;
  while (first > 0 && points(sorted[first - 1]) === points(sorted[index])) {
    first -= 1;
  }
  return first + 1;
}
