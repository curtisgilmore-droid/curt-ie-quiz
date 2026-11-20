import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AuthService } from '../../core/auth.service';
import { JoeExtractService } from '../../core/joe-extract.service';
import { QuizApiService } from '../../core/quiz-api.service';
import { AdminPage } from './admin-page';

const LOADED = {
  weekId: '530',
  title: 'Week 530',
  sourceUrl: 'https://www.joe.ie/quiz/week-530',
  questions: [{ text: 'Q1', options: ['a', 'b', 'c'], correctIndex: 2 }],
};

async function settle(fixture: ReturnType<typeof TestBed.createComponent<AdminPage>>) {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function setup(email: string | null, isAdmin: boolean) {
  const auth = {
    email: signal(email),
    init: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn(),
    signOut: vi.fn(),
    requestMagicLink: vi.fn().mockResolvedValue(undefined),
  };
  const api = {
    isAdmin: vi.fn().mockResolvedValue(isAdmin),
    publishQuiz: vi.fn().mockResolvedValue(undefined),
    getPlayers: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Ann', email: 'ann@example.com' }]),
    addPlayer: vi.fn().mockResolvedValue(undefined),
    removePlayer: vi.fn().mockResolvedValue(undefined),
    sendWeeklyInvite: vi.fn().mockResolvedValue({ sent: 1, skipped: false }),
    fetchLatestQuiz: vi.fn().mockResolvedValue({
      sent: 0,
      skipped: false,
      published: true,
      title: 'Week 530',
    }),
  };
  const extractor = { extract: vi.fn() };
  TestBed.configureTestingModule({
    imports: [AdminPage],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: QuizApiService, useValue: api },
      { provide: JoeExtractService, useValue: extractor },
    ],
  });
  const fixture = TestBed.createComponent(AdminPage);
  return { fixture, api, extractor, element: fixture.nativeElement as HTMLElement };
}

function typeUrl(element: HTMLElement, url: string): void {
  const input = element.querySelector('input[type="url"]') as HTMLInputElement;
  input.value = url;
  input.dispatchEvent(new Event('input'));
}

function buttonNamed(element: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(element.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text),
  ) as HTMLButtonElement;
}

describe('AdminPage', () => {
  it('shows the sign in form when signed out', async () => {
    const { fixture, element } = setup(null, false);
    await settle(fixture);
    expect(element.querySelector('input[type="password"]')).not.toBeNull();
    expect(element.textContent).toContain('magic link');
  });

  it('refuses users who are not in the admins table', async () => {
    const { fixture, element } = setup('someone@example.com', false);
    await settle(fixture);
    expect(element.textContent).toContain('Not an admin');
  });

  it('lists players for an admin', async () => {
    const { fixture, element } = setup('admin@example.com', true);
    await settle(fixture);
    expect(element.textContent).toContain('ann@example.com');
    expect(buttonNamed(element, 'Send this week').disabled).toBe(false);
  });

  it('keeps publish disabled until a quiz link has loaded', async () => {
    const { fixture, element } = setup('admin@example.com', true);
    await settle(fixture);
    expect(buttonNamed(element, 'Publish').disabled).toBe(true);
  });

  it('shows the load error and does not enable publish', async () => {
    const { fixture, extractor, element } = setup('admin@example.com', true);
    extractor.extract.mockRejectedValue(new Error('No quiz was found on that page.'));
    await settle(fixture);

    typeUrl(element, 'https://www.joe.ie/quiz/missing');
    await settle(fixture);
    buttonNamed(element, 'Load quiz').click();
    await settle(fixture);

    expect(element.textContent).toContain('No quiz was found');
    expect(buttonNamed(element, 'Publish').disabled).toBe(true);
  });

  it('previews a loaded quiz and publishes it', async () => {
    const { fixture, api, extractor, element } = setup('admin@example.com', true);
    extractor.extract.mockResolvedValue(LOADED);
    await settle(fixture);

    typeUrl(element, 'https://www.joe.ie/quiz/week-530');
    await settle(fixture);
    buttonNamed(element, 'Load quiz').click();
    await settle(fixture);

    const details = element.querySelector('details.quiz-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    details.open = true;
    expect(element.querySelector('pre.preview')?.textContent).toContain('[x] c');

    buttonNamed(element, 'Publish').click();
    await settle(fixture);

    expect(api.publishQuiz).toHaveBeenCalledWith(expect.objectContaining({ weekId: '530' }));
    expect(element.textContent).toContain('Published "Week 530"');
  });

  it('fetches this week without treating it as a manual publish', async () => {
    const { fixture, api, element } = setup('admin@example.com', true);
    await settle(fixture);
    buttonNamed(element, 'Fetch this week').click();
    await settle(fixture);
    expect(api.fetchLatestQuiz).toHaveBeenCalled();
    expect(api.publishQuiz).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Published "Week 530"');
  });

  it('sends the weekly invite from the admin button', async () => {
    const { fixture, api, element } = setup('admin@example.com', true);
    await settle(fixture);
    buttonNamed(element, 'Send this week').click();
    await settle(fixture);
    expect(api.sendWeeklyInvite).toHaveBeenCalled();
    expect(element.textContent).toContain('Sent 1 invite');
  });
});
