import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { QuizApiService } from '../../core/quiz-api.service';
import { LeaderboardPage } from './leaderboard-page';

function weeklyRow(quizId: string, playerName: string, score: number) {
  return {
    quizId,
    weekId: '529',
    playerId: playerName,
    playerName,
    score,
    total: 10,
    createdAt: '2026-11-13T10:00:00Z',
  };
}

async function settle(fixture: ReturnType<typeof TestBed.createComponent<LeaderboardPage>>) {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('LeaderboardPage', () => {
  it('shows the current week and the all-time board', async () => {
    const api = {
      getWeeks: vi.fn().mockResolvedValue([
        { quizId: 'q2', weekId: '530', title: 'Week 530', isCurrent: true },
        { quizId: 'q1', weekId: '529', title: 'Week 529', isCurrent: false },
      ]),
      getAllTimeScores: vi.fn().mockResolvedValue([
        { playerId: 'a', playerName: 'Ann', totalScore: 15, totalPossible: 20, quizzesPlayed: 2 },
        { playerId: 'b', playerName: 'Bob', totalScore: 12, totalPossible: 20, quizzesPlayed: 2 },
      ]),
      getWeeklyScores: vi
        .fn()
        .mockImplementation(async (quizId: string) =>
          quizId === 'q2' ? [weeklyRow('q2', 'Ann', 8), weeklyRow('q2', 'Bob', 9)] : [],
        ),
    };
    TestBed.configureTestingModule({
      imports: [LeaderboardPage],
      providers: [{ provide: QuizApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(LeaderboardPage);
    await settle(fixture);

    const tables = (fixture.nativeElement as HTMLElement).querySelectorAll('table.board');
    expect(api.getWeeklyScores).toHaveBeenCalledWith('q2');
    expect(tables).toHaveLength(2);
    expect(tables[0].querySelector('tbody tr td:nth-child(2)')?.textContent).toBe('Bob');
    expect(tables[1].querySelector('tbody tr td:nth-child(2)')?.textContent).toBe('Ann');
  });

  it('shows an error with a retry button when loading fails', async () => {
    const api = {
      getWeeks: vi.fn().mockRejectedValue(new Error('network down')),
      getAllTimeScores: vi.fn().mockResolvedValue([]),
      getWeeklyScores: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [LeaderboardPage],
      providers: [{ provide: QuizApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(LeaderboardPage);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('network down');
  });
});
