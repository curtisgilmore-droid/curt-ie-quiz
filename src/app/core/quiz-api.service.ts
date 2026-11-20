import { Injectable, inject } from '@angular/core';

import { environment } from '../../environments/environment';
import {
  AllTimeScore,
  CurrentPlayer,
  Player,
  Quiz,
  QuizDraft,
  QuizQuestion,
  WeekOption,
  WeeklyScore,
} from './models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

export type QuizApiErrorCode =
  | 'already_submitted'
  | 'quiz_not_current'
  | 'quiz_not_found'
  | 'player_not_found'
  | 'invalid_score'
  | 'not_authorized'
  | 'not_authenticated'
  | 'unknown';

const KNOWN_ERROR_CODES: readonly QuizApiErrorCode[] = [
  'already_submitted',
  'quiz_not_current',
  'quiz_not_found',
  'player_not_found',
  'invalid_score',
  'not_authorized',
  'not_authenticated',
];

export class QuizApiError extends Error {
  constructor(
    message: string,
    readonly code: QuizApiErrorCode,
  ) {
    super(message);
    this.name = 'QuizApiError';
  }
}

interface QuizRow {
  id: string;
  week_id: string;
  title: string;
  source_url: string;
  questions: QuizQuestion[];
  is_current: boolean;
  created_at: string;
}

interface WeeklyScoreRow {
  quiz_id: string;
  week_id: string;
  player_id: string;
  player_name: string;
  score: number;
  total: number;
  created_at: string;
}

interface AllTimeScoreRow {
  player_id: string;
  player_name: string;
  total_score: number;
  total_possible: number;
  quizzes_played: number;
}

interface PlayerRow {
  id: string;
  name: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class QuizApiService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async getCurrentQuiz(): Promise<Quiz | null> {
    const { data, error } = await this.supabase.client
      .from('quizzes')
      .select('*')
      .eq('is_current', true)
      .maybeSingle();
    if (error) {
      throw toApiError(error.message);
    }
    return data ? toQuiz(data as QuizRow) : null;
  }

  async getCurrentPlayer(): Promise<CurrentPlayer | null> {
    const { data, error } = await this.supabase.client.rpc('current_player');
    if (error) {
      throw toApiError(error.message);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return null;
    }
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
    };
  }

  async getPlayers(): Promise<Player[]> {
    const { data, error } = await this.supabase.client
      .from('players')
      .select('id, name, email')
      .order('name');
    if (error) {
      throw toApiError(error.message);
    }
    return ((data ?? []) as PlayerRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
    }));
  }

  async getWeeks(): Promise<WeekOption[]> {
    const { data, error } = await this.supabase.client
      .from('quizzes')
      .select('id, week_id, title, is_current, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      throw toApiError(error.message);
    }
    return (data ?? []).map((row) => ({
      quizId: row.id as string,
      weekId: row.week_id as string,
      title: row.title as string,
      isCurrent: row.is_current as boolean,
    }));
  }

  async getWeeklyScores(quizId: string): Promise<WeeklyScore[]> {
    const { data, error } = await this.supabase.client
      .from('weekly_leaderboard')
      .select('*')
      .eq('quiz_id', quizId);
    if (error) {
      throw toApiError(error.message);
    }
    return ((data ?? []) as WeeklyScoreRow[]).map(toWeeklyScore);
  }

  async getAllTimeScores(): Promise<AllTimeScore[]> {
    const { data, error } = await this.supabase.client.from('all_time_leaderboard').select('*');
    if (error) {
      throw toApiError(error.message);
    }
    return ((data ?? []) as AllTimeScoreRow[]).map(toAllTimeScore);
  }

  async submitScore(quizId: string, score: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('submit_score', {
      p_quiz_id: quizId,
      p_score: score,
    });
    if (error) {
      throw toApiError(error.message);
    }
  }

  async publishQuiz(draft: QuizDraft): Promise<void> {
    const { error } = await this.supabase.client.rpc('publish_quiz', {
      p_week_id: draft.weekId,
      p_title: draft.title,
      p_source_url: draft.sourceUrl,
      p_questions: draft.questions,
    });
    if (error) {
      throw toApiError(error.message);
    }
  }

  async isAdmin(): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('is_admin');
    if (error) {
      throw toApiError(error.message);
    }
    return data === true;
  }

  async addPlayer(name: string, email: string): Promise<void> {
    await this.callFunction('manage-players', {
      action: 'add',
      name: name.trim(),
      email: email.trim().toLowerCase(),
    });
  }

  async removePlayer(playerId: string): Promise<void> {
    await this.callFunction('manage-players', {
      action: 'remove',
      playerId,
    });
  }

  async sendWeeklyInvite(): Promise<InviteResult> {
    return this.callFunction('send-weekly-invite', { action: 'resend' }) as Promise<InviteResult>;
  }

  async fetchLatestQuiz(): Promise<InviteResult> {
    return this.callFunction('send-weekly-invite', { action: 'fetch' }) as Promise<InviteResult>;
  }

  private async callFunction(name: string, body: Record<string, unknown>): Promise<unknown> {
    const token = await this.auth.accessToken();
    if (!token) {
      throw new QuizApiError('You must be signed in.', 'not_authenticated');
    }
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
      throw new QuizApiError('Supabase is not configured.', 'unknown');
    }
    const response = await fetch(`${environment.supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: environment.supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as InviteResult & { error?: string };
    if (!response.ok) {
      throw toApiError(payload.error ?? `Function ${name} failed (${response.status})`);
    }
    return payload;
  }
}

interface InviteResult {
  sent: number;
  skipped: boolean;
  published?: boolean;
  title?: string;
  reason?: string;
}

function toApiError(message: string): QuizApiError {
  const code = KNOWN_ERROR_CODES.find((known) => message.includes(known)) ?? 'unknown';
  return new QuizApiError(message, code);
}

function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    weekId: row.week_id,
    title: row.title,
    sourceUrl: row.source_url,
    questions: row.questions,
    isCurrent: row.is_current,
    createdAt: row.created_at,
  };
}

function toWeeklyScore(row: WeeklyScoreRow): WeeklyScore {
  return {
    quizId: row.quiz_id,
    weekId: row.week_id,
    playerId: row.player_id,
    playerName: row.player_name,
    score: row.score,
    total: row.total,
    createdAt: row.created_at,
  };
}

function toAllTimeScore(row: AllTimeScoreRow): AllTimeScore {
  return {
    playerId: row.player_id,
    playerName: row.player_name,
    totalScore: row.total_score,
    totalPossible: row.total_possible,
    quizzesPlayed: row.quizzes_played,
  };
}
