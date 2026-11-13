import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

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
  weeklyScores: WeeklyScore[] = [],
  submitScore = vi.fn().mockResolvedValue(undefined),
) {
  const api = {
    getCurrentQuiz: vi.fn().mockResolvedValue(QUIZ),
    getPlayers: vi.fn().mockResolvedValue([
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bob' },
    ]),
    getWeeklyScores: vi.fn().mockResolvedValue(weeklyScores),
    submitScore,
  };
  TestBed.configureTestingModule({
    imports: [QuizPage],
    providers: [provideRouter([]), { provide: QuizApiService, useValue: api }],
  });
  const fixture = TestBed.createComponent(QuizPage);
  return { fixture, api, element: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function selectPlayer(element: HTMLElement, id: string): void {
  const select = element.querySelector('select') as HTMLSelectElement;
  select.value = id;
  select.dispatchEvent(new Event('change'));
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
  it('keeps the start button disabled until a player is chosen', async () => {
    const { fixture, element } = setup();
    await settle(fixture);

    const start = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start quiz',
    ) as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    selectPlayer(element, 'p1');
    await settle(fixture);
    expect(start.disabled).toBe(false);
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

    selectPlayer(element, 'p1');
    await settle(fixture);
    clickButton(element, 'Start quiz');
    await settle(fixture);

    expect(element.querySelector('.round')?.textContent).toBe('ROUND 1: Geography');
    expect(element.querySelector('img.question-image')?.getAttribute('src')).toBe(
      'https://assets.joe.ie/uploads/2026/11/1.webp',
    );
  });

  it('blocks a player who has already submitted this week', async () => {
    const { fixture, element } = setup([existingScore('p1')]);
    await settle(fixture);

    selectPlayer(element, 'p1');
    await settle(fixture);

    expect(element.textContent).toContain('already submitted');
    const start = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start quiz',
    ) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });

  it('scores the quiz, shows feedback and submits the final score', async () => {
    const { fixture, api, element } = setup();
    await settle(fixture);

    selectPlayer(element, 'p1');
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

    expect(api.submitScore).toHaveBeenCalledWith('p1', 'quiz-1', 1);
    expect(element.textContent).toContain('1 / 2');
    expect(element.textContent).toContain('Your score has been saved.');
  });

  it('tells the player when the server reports a duplicate submission', async () => {
    const submitScore = vi
      .fn()
      .mockRejectedValue(new QuizApiError('already_submitted', 'already_submitted'));
    const { fixture, element } = setup([], submitScore);
    await settle(fixture);

    selectPlayer(element, 'p2');
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
