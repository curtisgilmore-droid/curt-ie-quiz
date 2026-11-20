import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { CurrentPlayer, Quiz, QuizQuestion, WeeklyScore } from '../../core/models';
import { QuizApiError, QuizApiService } from '../../core/quiz-api.service';
import { rankWeekly } from '../../core/ranking';

type LoadState = 'loading' | 'ready' | 'no_quiz' | 'error';
type Phase = 'intro' | 'playing' | 'finished';
type SubmitState = 'idle' | 'submitting' | 'submitted' | 'duplicate' | 'failed';
type SignInState = 'idle' | 'sending' | 'sent' | 'failed';

@Component({
  selector: 'app-quiz-page',
  imports: [RouterLink],
  templateUrl: './quiz-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizPage implements OnInit {
  private readonly api = inject(QuizApiService);
  private readonly auth = inject(AuthService);

  constructor() {
    effect(() => {
      const email = this.auth.email();
      if (!this.auth.ready() || this.loadState() !== 'ready') {
        return;
      }
      if (email === null) {
        this.player.set(null);
        return;
      }
      void this.refreshPlayer();
    });
  }

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly quiz = signal<Quiz | null>(null);
  protected readonly player = signal<CurrentPlayer | null>(null);
  protected readonly weeklyScores = signal<WeeklyScore[]>([]);
  protected readonly authEmail = this.auth.email;

  protected readonly signInEmail = signal('');
  protected readonly signInState = signal<SignInState>('idle');
  protected readonly signInError = signal('');

  protected readonly phase = signal<Phase>('intro');
  protected readonly questionIndex = signal(0);
  protected readonly selectedAnswer = signal<number | null>(null);
  protected readonly score = signal(0);
  protected readonly submitState = signal<SubmitState>('idle');
  protected readonly submitError = signal('');

  protected readonly currentQuestion = computed<QuizQuestion | null>(
    () => this.quiz()?.questions[this.questionIndex()] ?? null,
  );
  protected readonly totalQuestions = computed(() => this.quiz()?.questions.length ?? 0);
  protected readonly currentRound = computed(() => {
    const questions = this.quiz()?.questions ?? [];
    const upToCurrent = questions.slice(0, this.questionIndex() + 1);
    return upToCurrent.filter((question) => question.round !== undefined).at(-1)?.round ?? '';
  });
  protected readonly isAnswered = computed(() => this.selectedAnswer() !== null);
  protected readonly isLastQuestion = computed(
    () => this.questionIndex() === this.totalQuestions() - 1,
  );
  protected readonly alreadyPlayed = computed(() => {
    const player = this.player();
    return player !== null && this.weeklyScores().some((entry) => entry.playerId === player.id);
  });
  protected readonly canStart = computed(() => this.player() !== null && !this.alreadyPlayed());
  protected readonly ranked = computed(() => rankWeekly(this.weeklyScores()));

  async ngOnInit(): Promise<void> {
    await this.auth.init();
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loadState.set('loading');
    try {
      const quiz = await this.api.getCurrentQuiz();
      if (quiz === null) {
        this.quiz.set(null);
        this.loadState.set('no_quiz');
        return;
      }
      const weeklyScores = await this.api.getWeeklyScores(quiz.id);
      this.quiz.set(quiz);
      this.weeklyScores.set(weeklyScores);
      await this.refreshPlayer();
      this.loadState.set('ready');
    } catch (error) {
      this.errorMessage.set(toMessage(error));
      this.loadState.set('error');
    }
  }

  protected updateSignInEmail(event: Event): void {
    this.signInEmail.set((event.target as HTMLInputElement).value);
    this.signInState.set('idle');
    this.signInError.set('');
  }

  protected async requestLink(): Promise<void> {
    const email = this.signInEmail().trim();
    if (email === '') {
      return;
    }
    this.signInState.set('sending');
    this.signInError.set('');
    try {
      await this.auth.requestMagicLink(email);
      this.signInState.set('sent');
    } catch (error) {
      this.signInError.set(toMessage(error));
      this.signInState.set('failed');
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.player.set(null);
    this.phase.set('intro');
  }

  protected start(): void {
    if (!this.canStart()) {
      return;
    }
    this.score.set(0);
    this.questionIndex.set(0);
    this.selectedAnswer.set(null);
    this.phase.set('playing');
  }

  protected choose(optionIndex: number): void {
    const question = this.currentQuestion();
    if (question === null || this.isAnswered()) {
      return;
    }
    this.selectedAnswer.set(optionIndex);
    if (optionIndex === question.correctIndex) {
      this.score.update((value) => value + 1);
    }
  }

  protected async next(): Promise<void> {
    if (!this.isAnswered()) {
      return;
    }
    if (this.isLastQuestion()) {
      this.phase.set('finished');
      await this.submit();
      return;
    }
    this.questionIndex.update((value) => value + 1);
    this.selectedAnswer.set(null);
  }

  protected async submit(): Promise<void> {
    const quiz = this.quiz();
    if (quiz === null) {
      return;
    }
    this.submitState.set('submitting');
    this.submitError.set('');
    try {
      await this.api.submitScore(quiz.id, this.score());
      this.submitState.set('submitted');
    } catch (error) {
      if (error instanceof QuizApiError && error.code === 'already_submitted') {
        this.submitState.set('duplicate');
      } else {
        this.submitError.set(toMessage(error));
        this.submitState.set('failed');
        return;
      }
    }
    await this.refreshBoard(quiz.id);
  }

  protected optionClass(optionIndex: number): string {
    const question = this.currentQuestion();
    const selected = this.selectedAnswer();
    if (question === null || selected === null) {
      return 'option';
    }
    if (optionIndex === question.correctIndex) {
      return 'option correct';
    }
    return optionIndex === selected ? 'option wrong' : 'option';
  }

  protected playerName(): string {
    return this.player()?.name ?? '';
  }

  private async refreshPlayer(): Promise<void> {
    if (this.auth.email() === null) {
      this.player.set(null);
      return;
    }
    this.player.set(await this.api.getCurrentPlayer());
  }

  private async refreshBoard(quizId: string): Promise<void> {
    const scores = await this.api.getWeeklyScores(quizId).catch(() => null);
    if (scores !== null) {
      this.weeklyScores.set(scores);
    }
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
