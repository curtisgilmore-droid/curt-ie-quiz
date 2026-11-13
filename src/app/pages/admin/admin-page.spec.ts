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
  };
  const api = {
    isAdmin: vi.fn().mockResolvedValue(isAdmin),
    publishQuiz: vi.fn().mockResolvedValue(undefined),
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
  });

  it('refuses users who are not in the admins table', async () => {
    const { fixture, element } = setup('someone@example.com', false);
    await settle(fixture);
    expect(element.textContent).toContain('Not an admin');
  });

  it('keeps publish disabled until a quiz link has loaded', async () => {
    const { fixture, element } = setup('admin@example.com', true);
    await settle(fixture);
    expect(buttonNamed(element, 'Publish').disabled).toBe(true);
    expect(buttonNamed(element, 'Load quiz').disabled).toBe(true);
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
});
