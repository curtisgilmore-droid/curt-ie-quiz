import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';

import { AuthService } from '../../core/auth.service';
import { QuizDraft } from '../../core/models';
import { QuizApiService } from '../../core/quiz-api.service';
import { QuizValidationError, parseQuizJson } from '../../core/quiz-parser';

type AdminState = 'loading' | 'signed_out' | 'not_admin' | 'admin';

interface ParseResult {
  draft: QuizDraft | null;
  error: string;
}

export const SAMPLE_QUIZ_JSON = `{
  "weekId": "529",
  "title": "The JOE Friday Pub Quiz - Week 529",
  "sourceUrl": "https://www.joe.ie/quiz/the-joe-friday-pub-quiz-week-529-889400",
  "questions": [
    {
      "text": "Which city is the capital of Ireland?",
      "options": ["Cork", "Dublin", "Galway"],
      "correctIndex": 1
    }
  ]
}`;

@Component({
  selector: 'app-admin-page',
  templateUrl: './admin-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(QuizApiService);

  protected readonly sampleJson = SAMPLE_QUIZ_JSON;
  protected readonly state = signal<AdminState>('loading');
  protected readonly email = this.auth.email;
  protected readonly message = signal('');
  protected readonly messageIsError = signal(false);
  protected readonly busy = signal(false);
  protected readonly jsonText = signal('');

  protected readonly parsed = computed<ParseResult>(() => {
    const text = this.jsonText().trim();
    if (text === '') {
      return { draft: null, error: '' };
    }
    try {
      return { draft: parseQuizJson(text), error: '' };
    } catch (error) {
      const message = error instanceof QuizValidationError ? error.message : 'Invalid quiz JSON.';
      return { draft: null, error: message };
    }
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.auth.init();
      await this.refreshState();
    } catch (error) {
      this.showError(toMessage(error));
      this.state.set('signed_out');
    }
  }

  protected async signIn(email: string, password: string): Promise<void> {
    this.busy.set(true);
    this.clearMessage();
    try {
      await this.auth.signIn(email, password);
      await this.refreshState();
    } catch (error) {
      this.showError(toMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.clearMessage();
    this.state.set('signed_out');
  }

  protected updateJson(event: Event): void {
    this.jsonText.set((event.target as HTMLTextAreaElement).value);
  }

  protected async publish(): Promise<void> {
    const draft = this.parsed().draft;
    if (draft === null) {
      return;
    }
    this.busy.set(true);
    this.clearMessage();
    try {
      await this.api.publishQuiz(draft);
      this.showSuccess(`Published "${draft.title}" as the current quiz.`);
      this.jsonText.set('');
    } catch (error) {
      this.showError(toMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async refreshState(): Promise<void> {
    if (this.auth.email() === null) {
      this.state.set('signed_out');
      return;
    }
    const isAdmin = await this.api.isAdmin();
    this.state.set(isAdmin ? 'admin' : 'not_admin');
  }

  private showError(text: string): void {
    this.message.set(text);
    this.messageIsError.set(true);
  }

  private showSuccess(text: string): void {
    this.message.set(text);
    this.messageIsError.set(false);
  }

  private clearMessage(): void {
    this.message.set('');
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
