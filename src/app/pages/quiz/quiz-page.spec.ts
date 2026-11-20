import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { AuthService } from '../../core/auth.service';
import { Quiz, WeeklyScore } from '../../core/models';
import { QuizApiError, QuizApiService } from '../../core/quiz-api.service';
import { QuizPage } from './quiz-page';

const QUIZ: Quiz = {
  id: 'quiz-1',
  weekId: '529',
  title: 'Week 529',
  sourceUrl: 'https://www.joe.ie/quiz/week-529',
  isCurrent: true,
  createdAt: '2026-11-13T00:00:00Z',
  questions: [
    { text: 'Q1', options: ['a', 'b', 'c'], correctIndex: 0 },
    { text: 'Q2', options: ['a', 'b', 'c'], correctIndex: 2 },
  ],
};

const PLAYER = { id: 'p1', name: 'Ann', email: 'ann@example.com' };

function existingScore(playerId: string): WeeklyScore {
  return {
    quizId: 'quiz-1',
    weekId: '529',
    playerId,
    playerName: 'Existing',
    score: 1,
    total: 2,
    createdAt: '2026-11-13T08:00:00Z',
  };
}

function setup(
  options: {
    email?: string | null;
    player?: typeof PLAYER | null;
    weeklyScores?: WeeklyScore[];
    submitScore?: ReturnType<typeof vi.fn>;
    requestMagicLink?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const email = signal(options.email === undefined ? PLAYER.email : options.email);
  const auth = {
    email,
    ready: signal(true),
    init: vi.fn().mockResolvedValue(undefined),
    requestMagicLink: options.requestMagicLink ?? vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
  const api = {
    getCurrentQuiz: vi.fn().mockResolvedValue(QUIZ),
    getCurrentPlayer: vi
      .fn()
      .mockResolvedValue(options.player === undefined ? PLAYER : options.player),
    getWeeklyScores: vi.fn().mockResolvedValue(options.weeklyScores ?? []),
    submitScore: options.submitScore ?? vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    imports: [QuizPage],
    providers: [
      provideRouter([]),
      { provide: QuizApiService, useValue: api },
      { provide: AuthService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(QuizPage);
  return { fixture, api, auth, element: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function clickButton(element: HTMLElement, text: string): void {
  const button = Array.from(element.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`No button with text "${text}"`);
  }
  button.click();
}

describe('QuizPage', () => {
  it('asks for an email when signed out', async () => {
    const { fixture, element } = setup({ email: null, player: null });
    await settle(fixture);
    expect(element.querySelector('input[type="email"]')).not.toBeNull();
    expect(element.textContent).toContain('Email me a sign-in link');
  });

  it('sends a magic link for the typed email', async () => {
    const requestMagicLink = vi.fn().mockResolvedValue(undefined);
    const { fixture, auth, element } = setup({
      email: null,
      player: null,
      requestMagicLink,
    });
    await settle(fixture);

    const input = element.querySelector('input[type="email"]') as HTMLInputElement;
    input.value = 'ann@example.com';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
    clickButton(element, 'Email me a sign-in link');
    await settle(fixture);

    expect(auth.requestMagicLink).toHaveBeenCalledWith('ann@example.com');
    expect(element.textContent).toContain('Check your inbox');
  });

  it('blocks a signed-in player who has already submitted this week', async () => {
    const { fixture, element } = setup({ weeklyScores: [existingScore('p1')] });
    await settle(fixture);

    expect(element.textContent).toContain('already submitted');
    const start = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start quiz',
    ) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });

  it('shows the round name and question image', async () => {
    const { fixture, api, element } = setup();
    api.getCurrentQuiz.mockResolvedValue({
      ...QUIZ,
      questions: [
        {
          text: 'Q1',
          options: ['a', 'b', 'c'],
          correctIndex: 0,
          round: 'ROUND 1: Geography',
          imageUrl: 'https://assets.joe.ie/uploads/2026/11/1.webp',
        },
      ],
    });
    await settle(fixture);

    clickButton(element, 'Start quiz');
    await settle(fixture);

    expect(element.querySelector('.round')?.textContent).toBe('ROUND 1: Geography');
    expect(element.querySelector('img.question-image')?.getAttribute('src')).toBe(
      'https://assets.joe.ie/uploads/2026/11/1.webp',
    );
  });

  it('scores the quiz and submits without a client-chosen player id', async () => {
    const { fixture, api, element } = setup();
    await settle(fixture);

    clickButton(element, 'Start quiz');
    await settle(fixture);

    clickButton(element, 'a');
    await settle(fixture);
    expect(element.textContent).toContain('Correct!');
    clickButton(element, 'Next question');
    await settle(fixture);

    clickButton(element, 'a');
    await settle(fixture);
    expect(element.textContent).toContain('Not quite.');
    clickButton(element, 'Finish');
    await settle(fixture);

    expect(api.submitScore).toHaveBeenCalledWith('quiz-1', 1);
    expect(element.textContent).toContain('1 / 2');
    expect(element.textContent).toContain('Your score has been saved.');
  });

  it('tells the player when the server reports a duplicate submission', async () => {
    const submitScore = vi
      .fn()
      .mockRejectedValue(new QuizApiError('already_submitted', 'already_submitted'));
    const { fixture, element } = setup({ submitScore });
    await settle(fixture);

    clickButton(element, 'Start quiz');
    await settle(fixture);
    clickButton(element, 'a');
    await settle(fixture);
    clickButton(element, 'Next question');
    await settle(fixture);
    clickButton(element, 'c');
    await settle(fixture);
    clickButton(element, 'Finish');
    await settle(fixture);

    expect(element.textContent).toContain('your first score stands');
  });
});
