import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AuthService } from '../../core/auth.service';
import { QuizApiService } from '../../core/quiz-api.service';
import { AdminPage } from './admin-page';

const VALID_JSON = JSON.stringify({
  weekId: '530',
  title: 'Week 530',
  sourceUrl: 'https://www.joe.ie/quiz/week-530',
  questions: [{ text: 'Q1', options: ['a', 'b', 'c'], correctIndex: 2 }],
});

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
  TestBed.configureTestingModule({
    imports: [AdminPage],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: QuizApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(AdminPage);
  return { fixture, api, element: fixture.nativeElement as HTMLElement };
}

function typeJson(element: HTMLElement, text: string): void {
  const textarea = element.querySelector('textarea') as HTMLTextAreaElement;
  textarea.value = text;
  textarea.dispatchEvent(new Event('input'));
}

function publishButton(element: HTMLElement): HTMLButtonElement {
  return Array.from(element.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Publish'),
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

  it('keeps publish disabled and shows the reason for invalid JSON', async () => {
    const { fixture, element } = setup('admin@example.com', true);
    await settle(fixture);

    typeJson(element, '{"weekId": "1"}');
    await settle(fixture);

    expect(publishButton(element).disabled).toBe(true);
    expect(element.querySelector('.notice.error')?.textContent).toContain('title');
  });

  it('previews and publishes a valid quiz', async () => {
    const { fixture, api, element } = setup('admin@example.com', true);
    await settle(fixture);

    typeJson(element, VALID_JSON);
    await settle(fixture);
    expect(element.querySelector('pre.preview')?.textContent).toContain('[x] c');

    publishButton(element).click();
    await settle(fixture);

    expect(api.publishQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ weekId: '530', title: 'Week 530' }),
    );
    expect(element.textContent).toContain('Published "Week 530"');
  });
});
