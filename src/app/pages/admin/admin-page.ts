import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { AuthService } from '../../core/auth.service';
import { JoeExtractService } from '../../core/joe-extract.service';
import { Player, QuizDraft } from '../../core/models';
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
  protected readonly players = signal<Player[]>([]);
  protected readonly newName = signal('');
  protected readonly newEmail = signal('');
  protected readonly magicEmail = signal('');
  protected readonly magicSent = signal(false);

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

  protected async requestMagicLink(): Promise<void> {
    this.busy.set(true);
    this.clearMessage();
    this.magicSent.set(false);
    try {
      await this.auth.requestMagicLink(this.magicEmail());
      this.magicSent.set(true);
    } catch (error) {
      this.showError(toMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.clearMessage();
    this.players.set([]);
    this.state.set('signed_out');
  }

  protected updateUrl(event: Event): void {
    this.quizUrl.set((event.target as HTMLInputElement).value);
    this.draft.set(null);
  }

  protected updateMagicEmail(event: Event): void {
    this.magicEmail.set((event.target as HTMLInputElement).value);
  }

  protected updateNewName(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
  }

  protected updateNewEmail(event: Event): void {
    this.newEmail.set((event.target as HTMLInputElement).value);
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

  protected async addPlayer(): Promise<void> {
    this.busy.set(true);
    this.clearMessage();
    try {
      await this.api.addPlayer(this.newName(), this.newEmail());
      this.newName.set('');
      this.newEmail.set('');
      await this.loadPlayers();
      this.showSuccess('Player added.');
    } catch (error) {
      this.showError(toMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async removePlayer(playerId: string): Promise<void> {
    this.busy.set(true);
    this.clearMessage();
    try {
      await this.api.removePlayer(playerId);
      await this.loadPlayers();
      this.showSuccess('Player removed.');
    } catch (error) {
      this.showError(toMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async fetchLatest(): Promise<void> {
    this.busy.set(true);
    this.clearMessage();
    try {
      const result = await this.api.fetchLatestQuiz();
      if (result.published) {
        this.showSuccess(`Published "${result.title ?? 'this week'}" as the current quiz.`);
      } else if (result.skipped) {
        this.showSuccess(result.reason ?? 'The current quiz is already this week.');
      } else {
        this.showError(result.reason ?? 'The quiz was not published.');
      }
    } catch (error) {
      this.showError(toMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async sendInvite(): Promise<void> {
    this.busy.set(true);
    this.clearMessage();
    try {
      const result = await this.api.sendWeeklyInvite();
      if (result.skipped) {
        this.showError(result.reason ?? 'Invite was skipped.');
      } else {
        this.showSuccess(`Sent ${result.sent} invite${result.sent === 1 ? '' : 's'}.`);
      }
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
    if (!isAdmin) {
      this.state.set('not_admin');
      return;
    }
    this.state.set('admin');
    await this.loadPlayers();
  }

  private async loadPlayers(): Promise<void> {
    this.players.set(await this.api.getPlayers());
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
