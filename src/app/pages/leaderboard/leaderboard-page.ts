import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';

import { AllTimeScore, WeekOption, WeeklyScore } from '../../core/models';
import { QuizApiService } from '../../core/quiz-api.service';
import { rankAllTime, rankWeekly } from '../../core/ranking';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-leaderboard-page',
  templateUrl: './leaderboard-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardPage implements OnInit {
  private readonly api = inject(QuizApiService);

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly weeks = signal<WeekOption[]>([]);
  protected readonly selectedQuizId = signal('');
  protected readonly weeklyScores = signal<WeeklyScore[]>([]);
  protected readonly allTimeScores = signal<AllTimeScore[]>([]);
  protected readonly weeklyLoading = signal(false);

  protected readonly weeklyRanked = computed(() => rankWeekly(this.weeklyScores()));
  protected readonly allTimeRanked = computed(() => rankAllTime(this.allTimeScores()));

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loadState.set('loading');
    try {
      const [weeks, allTime] = await Promise.all([
        this.api.getWeeks(),
        this.api.getAllTimeScores(),
      ]);
      this.weeks.set(weeks);
      this.allTimeScores.set(allTime);
      const initial = weeks.find((week) => week.isCurrent) ?? weeks[0];
      if (initial) {
        this.selectedQuizId.set(initial.quizId);
        this.weeklyScores.set(await this.api.getWeeklyScores(initial.quizId));
      }
      this.loadState.set('ready');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Something went wrong.');
      this.loadState.set('error');
    }
  }

  protected async selectWeek(event: Event): Promise<void> {
    const quizId = (event.target as HTMLSelectElement).value;
    this.selectedQuizId.set(quizId);
    this.weeklyLoading.set(true);
    try {
      this.weeklyScores.set(await this.api.getWeeklyScores(quizId));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Something went wrong.');
      this.loadState.set('error');
    } finally {
      this.weeklyLoading.set(false);
    }
  }
}
