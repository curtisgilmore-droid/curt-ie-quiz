import { OPTIONS_PER_QUESTION, QuizDraft, QuizQuestion } from './models';

export class QuizValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuizValidationError';
  }
}

export function parseQuizJson(text: string): QuizDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new QuizValidationError(`Not valid JSON: ${(error as Error).message}`);
  }
  return validateQuizDraft(raw);
}

export function validateQuizDraft(raw: unknown): QuizDraft {
  if (!isRecord(raw)) {
    throw new QuizValidationError('The quiz must be a JSON object.');
  }
  const weekId = requireText(raw['weekId'], 'weekId');
  const title = requireText(raw['title'], 'title');
  const sourceUrl = requireHttpUrl(raw['sourceUrl'], 'sourceUrl');
  const rawQuestions = raw['questions'];
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new QuizValidationError('questions must be a non-empty array.');
  }
  const questions = rawQuestions.map((question, index) => validateQuestion(question, index));
  return { weekId, title, sourceUrl, questions };
}

function validateQuestion(raw: unknown, index: number): QuizQuestion {
  const label = `Question ${index + 1}`;
  if (!isRecord(raw)) {
    throw new QuizValidationError(`${label} must be an object.`);
  }
  const text = requireText(raw['text'], `${label} text`);
  const options = raw['options'];
  if (!Array.isArray(options) || options.length !== OPTIONS_PER_QUESTION) {
    throw new QuizValidationError(`${label} must have exactly ${OPTIONS_PER_QUESTION} options.`);
  }
  const cleanOptions = options.map((option, optionIndex) =>
    requireText(option, `${label} option ${optionIndex + 1}`),
  );
  const correctIndex = raw['correctIndex'];
  if (
    typeof correctIndex !== 'number' ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= OPTIONS_PER_QUESTION
  ) {
    throw new QuizValidationError(
      `${label} correctIndex must be a whole number from 0 to ${OPTIONS_PER_QUESTION - 1}.`,
    );
  }
  const question: QuizQuestion = { text, options: cleanOptions, correctIndex };
  if (raw['round'] !== undefined) {
    question.round = requireText(raw['round'], `${label} round`);
  }
  if (raw['imageUrl'] !== undefined) {
    question.imageUrl = requireHttpUrl(raw['imageUrl'], `${label} imageUrl`);
  }
  return question;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new QuizValidationError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireHttpUrl(value: unknown, field: string): string {
  const text = requireText(value, field);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new QuizValidationError(`${field} must be a valid URL.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new QuizValidationError(`${field} must start with http:// or https://.`);
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
