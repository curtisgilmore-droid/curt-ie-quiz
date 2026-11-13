import type { QuizDraft, QuizQuestion } from './models';

const JINA_PREFIX = 'https://r.jina.ai/';
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  hellip: '\u2026',
  ndash: '\u2013',
  mdash: '\u2014',
};

export class JoeExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoeExtractError';
  }
}

export function joeQuizUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new JoeExtractError('Paste the full quiz link, starting with https://.');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('joe.ie') ||
    !url.pathname.startsWith('/quiz/')
  ) {
    throw new JoeExtractError(
      'The link must be a JOE.ie quiz page, like https://www.joe.ie/quiz/...',
    );
  }
  return url;
}

export async function fetchJoeQuiz(rawUrl: string): Promise<QuizDraft> {
  const pageUrl = joeQuizUrl(rawUrl);
  const pageHtml = await fetchHtml(pageUrl.href);
  const embedUrl = new URL(`/wpvq-embed/${findEmbedId(pageHtml)}/`, pageUrl.origin);
  const embedHtml = await fetchHtml(embedUrl.href);
  return quizFromHtml(pageHtml, embedHtml, pageUrl);
}

export function quizFromHtml(pageHtml: string, embedHtml: string, pageUrl: URL): QuizDraft {
  return {
    weekId: findWeekId(pageHtml, pageUrl),
    title: findTitle(pageHtml),
    sourceUrl: pageUrl.href,
    questions: parseQuestions(embedHtml, parseAnswerKey(embedHtml)),
  };
}

async function fetchHtml(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${JINA_PREFIX}${url}`, {
      headers: { 'x-return-format': 'html' },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new JoeExtractError(`Could not reach JOE.ie: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new JoeExtractError(`Could not read the quiz page (HTTP ${response.status}).`);
  }
  return response.text();
}

function findEmbedId(html: string): string {
  const match = html.match(/wpvq-embed\/(\d+)/);
  if (!match) {
    throw new JoeExtractError('No quiz was found on that page.');
  }
  return match[1];
}

function findTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = html.match(/<title>([\s\S]*?)<\/title>/);
  const raw = h1?.[1] ?? title?.[1] ?? 'JOE quiz';
  return cleanText(raw.replace(/\|\s*JOE\.ie\s*$/i, ''));
}

function findWeekId(html: string, url: URL): string {
  const fromTitle = findTitle(html).match(/week\s+(\d+)/i);
  if (fromTitle) {
    return fromTitle[1];
  }
  return url.pathname.split('/').filter(Boolean).pop() ?? 'unknown';
}

function parseAnswerKey(html: string): Record<string, string> {
  const match = html.match(/var wpvq_ans\d+ = (\{[\s\S]*?\});/);
  if (!match) {
    throw new JoeExtractError('The quiz page did not include an answer key.');
  }
  const key: Record<string, string> = {};
  for (const group of Object.values(
    JSON.parse(match[1]) as Record<string, Record<string, string>>,
  )) {
    Object.assign(key, group);
  }
  return key;
}

function parseQuestions(html: string, key: Record<string, string>): QuizQuestion[] {
  return html
    .split('<div class="wpvq-question wpvq-line"')
    .slice(1)
    .map((block, index) => parseQuestion(block, key, index + 1));
}

function parseQuestion(block: string, key: Record<string, string>, number: number): QuizQuestion {
  const label = block.match(/<div class="wpvq-question-label">([\s\S]*?)<\/div>/);
  if (!label) {
    throw new JoeExtractError(`Question ${number} has no text.`);
  }
  const { round, text } = splitRound(label[1]);
  const image = block.match(/<img[^>]*class="wpvq-question-img"[^>]*src="([^"]+)"/);
  const imageAlt = block.match(/<img[^>]*src="([^"]+)"[^>]*class="wpvq-question-img"/);
  const answers = [
    ...block.matchAll(/<label class="vq-css-label" data-wpvq-answer="(\d+)">([\s\S]*?)<\/label>/g),
  ];
  const options = answers.map((answer) => cleanText(answer[2]));
  const correctIndexes = answers.flatMap((answer, optionIndex) =>
    key[answer[1]] === '1' ? [optionIndex] : [],
  );
  if (correctIndexes.length !== 1) {
    throw new JoeExtractError(
      `Question ${number} should have one correct answer, but ${correctIndexes.length} were marked.`,
    );
  }
  const imageUrl = image?.[1] ?? imageAlt?.[1];
  const question: QuizQuestion = { text, options, correctIndex: correctIndexes[0] };
  if (round) {
    question.round = round;
  }
  if (imageUrl) {
    question.imageUrl = imageUrl;
  }
  return question;
}

function splitRound(rawLabel: string): { round: string; text: string } {
  const parts = rawLabel
    .split(/<br\s*\/?>/i)
    .map(cleanText)
    .filter(Boolean);
  if (parts.length > 1 && /^round\s+\d+/i.test(parts[0])) {
    return { round: parts[0], text: parts.slice(1).join(' ') };
  }
  return { round: '', text: parts.join(' ') };
}

function cleanText(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}
