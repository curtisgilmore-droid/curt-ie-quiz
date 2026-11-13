import { readFileSync, writeFileSync } from 'node:fs';

const JINA_PREFIX = 'https://r.jina.ai/';
const NAMED_ENTITIES = {
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

const [source, outputPath] = process.argv.slice(2);
if (!source) {
  console.error('Usage: node scripts/extract-joe-quiz.mjs <joe.ie quiz url> [output.json]');
  process.exit(1);
}

const pageUrl = new URL(source);
const pageHtml = await fetchHtml(pageUrl.href);
const embedId = findEmbedId(pageHtml);
const embedHtml = await fetchHtml(new URL(`/wpvq-embed/${embedId}/`, pageUrl.origin).href);

const quiz = {
  weekId: findWeekId(pageHtml, pageUrl),
  title: findTitle(pageHtml),
  sourceUrl: pageUrl.href,
  questions: parseQuestions(embedHtml, parseAnswerKey(embedHtml)),
};

const json = `${JSON.stringify(quiz, null, 2)}\n`;
if (outputPath) {
  writeFileSync(outputPath, json);
  console.error(`Wrote ${quiz.questions.length} questions to ${outputPath}`);
} else {
  process.stdout.write(json);
}

async function fetchHtml(url) {
  if (url.startsWith('file:')) {
    return readFileSync(new URL(url), 'utf8');
  }
  const response = await fetch(`${JINA_PREFIX}${url}`, { headers: { 'x-return-format': 'html' } });
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

function findEmbedId(html) {
  const match = html.match(/wpvq-embed\/(\d+)/);
  if (!match) {
    throw new Error('No quiz embed found on the page.');
  }
  return match[1];
}

function findTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = html.match(/<title>([\s\S]*?)<\/title>/);
  const raw = h1?.[1] ?? title?.[1] ?? 'JOE quiz';
  return cleanText(raw.replace(/\|\s*JOE\.ie\s*$/i, ''));
}

function findWeekId(html, url) {
  const fromTitle = findTitle(html).match(/week\s+(\d+)/i);
  if (fromTitle) {
    return fromTitle[1];
  }
  return url.pathname.split('/').filter(Boolean).pop() ?? 'unknown';
}

function parseAnswerKey(html) {
  const match = html.match(/var wpvq_ans\d+ = (\{[\s\S]*?\});/);
  if (!match) {
    throw new Error('Could not find the answer key in the quiz embed.');
  }
  const key = {};
  for (const group of Object.values(JSON.parse(match[1]))) {
    Object.assign(key, group);
  }
  return key;
}

function parseQuestions(html, key) {
  const blocks = html.split('<div class="wpvq-question wpvq-line"').slice(1);
  return blocks.map((block, index) => parseQuestion(block, key, index + 1));
}

function parseQuestion(block, key, number) {
  const label = block.match(/<div class="wpvq-question-label">([\s\S]*?)<\/div>/);
  if (!label) {
    throw new Error(`Question ${number}: no label found.`);
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
    throw new Error(
      `Question ${number}: expected one correct answer, found ${correctIndexes.length}.`,
    );
  }
  const imageUrl = image?.[1] ?? imageAlt?.[1];
  const question = { text, options, correctIndex: correctIndexes[0] };
  if (round) {
    question.round = round;
  }
  if (imageUrl) {
    question.imageUrl = imageUrl;
  }
  return question;
}

function splitRound(rawLabel) {
  const parts = rawLabel
    .split(/<br\s*\/?>/i)
    .map(cleanText)
    .filter(Boolean);
  if (parts.length > 1 && /^round\s+\d+/i.test(parts[0])) {
    return { round: parts[0], text: parts.slice(1).join(' ') };
  }
  return { round: '', text: parts.join(' ') };
}

function cleanText(raw) {
  return decodeEntities(raw.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text) {
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
