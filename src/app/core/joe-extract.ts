export {
  JoeExtractError,
  fetchJoeQuiz,
  fetchLatestFridayQuiz,
  joeQuizUrl,
  latestFridayQuizUrl,
  quizFromHtml,
  syncLatestQuiz,
} from '../../../supabase/functions/_shared/joe-extract';

export type { ExtractedQuestion, ExtractedQuiz } from '../../../supabase/functions/_shared/joe-extract';
