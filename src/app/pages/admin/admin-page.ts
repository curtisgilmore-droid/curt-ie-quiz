import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { AuthService } from '../../core/auth.service';
import { JoeExtractService } from '../../core/joe-extract.service';
import { QuizDraft } from '../../core/models';
import { QuizApiService } from '../../core/quiz-api.service';
import { QuizValidationError, validateQuizDraft } from '../../core/quiz-parser';

type AdminState = 'loading' | 'signed_out' | 'not_admin' | 'admin';

@Component({
  selector: 'app-admin-page',
  templateUrl: './admin-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(QuizApiService);
  private readonly extractor = inject(JoeExtractService);

  protected readonly state = signal<AdminState>('loading');
  protected readonly email = this.auth.email;
  protected readonly message = signal('');
  protected readonly messageIsError = signal(false);
  protected readonly busy = signal(false);
  protected readonly quizUrl = signal('');
  protected readonly draft = signal<QuizDraft | null>(null);

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

  protected updateUrl(event: Event): void {
    this.quizUrl.set((event.target as HTMLInputElement).value);
    this.draft.set(null);
  }

  protected async loadQuiz(): Promise<void> {
    this.busy.set(true);
    this.clearMessage();
    this.draft.set(null);
    try {
      const loaded = await this.extractor.extract(this.quizUrl());
      this.draft.set(validateQuizDraft(loaded));
    } catch (error) {
      const message = error instanceof QuizValidationError ? error.message : toMessage(error);
      this.showError(message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async publish(): Promise<void> {
    const draft = this.draft();
    if (draft === null) {
      return;
    }
    this.busy.set(true);
    this.clearMessage();
    try {
      await this.api.publishQuiz(draft);
      this.showSuccess(`Published "${draft.title}" as the current quiz.`);
      this.draft.set(null);
      this.quizUrl.set('');
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
