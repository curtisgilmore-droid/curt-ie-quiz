export const OPTIONS_PER_QUESTION = 3;

export interface QuizQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  round?: string;
  imageUrl?: string;
}

export interface QuizDraft {
  weekId: string;
  title: string;
  sourceUrl: string;
  questions: QuizQuestion[];
}

export interface Quiz {
  id: string;
  weekId: string;
  title: string;
  sourceUrl: string;
  questions: QuizQuestion[];
  isCurrent: boolean;
  createdAt: string;
}

export interface Player {
  id: string;
  name: string;
  email?: string;
}

export interface CurrentPlayer {
  id: string;
  name: string;
  email: string;
}

export interface WeeklyScore {
  quizId: string;
  weekId: string;
  playerId: string;
  playerName: string;
  score: number;
  total: number;
  createdAt: string;
}

export interface AllTimeScore {
  playerId: string;
  playerName: string;
  totalScore: number;
  totalPossible: number;
  quizzesPlayed: number;
}

export interface WeekOption {
  quizId: string;
  weekId: string;
  title: string;
  isCurrent: boolean;
}

export interface RankedEntry<T> {
  rank: number;
  entry: T;
}
