import { writeFileSync } from 'node:fs';

import { fetchJoeQuiz } from '../supabase/functions/_shared/joe-extract.ts';

const [source, outputPath] = process.argv.slice(2);
if (!source) {
  console.error('Usage: node scripts/extract-joe-quiz.mjs <joe.ie quiz url> [output.json]');
  process.exit(1);
}

const quiz = await fetchJoeQuiz(source);
const json = `${JSON.stringify(quiz, null, 2)}\n`;
if (outputPath) {
  writeFileSync(outputPath, json);
  console.error(`Wrote ${quiz.questions.length} questions to ${outputPath}`);
} else {
  process.stdout.write(json);
}
