import { Injectable, inject } from '@angular/core';

import {
  AllTimeScore,
  Player,
  Quiz,
  QuizDraft,
  QuizQuestion,
  WeekOption,
  WeeklyScore,
} from './models';
import { SupabaseService } from './supabase.service';

export type QuizApiErrorCode =
  | 'already_submitted'
  | 'quiz_not_current'
  | 'quiz_not_found'
  | 'player_not_found'
  | 'invalid_score'
  | 'not_authorized'
  | 'unknown';

const KNOWN_ERROR_CODES: readonly QuizApiErrorCode[] = [
  'already_submitted',
  'quiz_not_current',
  'quiz_not_found',
  'player_not_found',
  'invalid_score',
  'not_authorized',
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

@Injectable({ providedIn: 'root' })
export class QuizApiService {
  private readonly supabase = inject(SupabaseService);

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

  async getPlayers(): Promise<Player[]> {
    const { data, error } = await this.supabase.client
      .from('players')
      .select('id, name')
      .order('name');
    if (error) {
      throw toApiError(error.message);
    }
    return (data ?? []) as Player[];
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

  async submitScore(playerId: string, quizId: string, score: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('submit_score', {
      p_player_id: playerId,
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
