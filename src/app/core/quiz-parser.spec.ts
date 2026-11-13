import { QuizValidationError, parseQuizJson } from './quiz-parser';

const VALID = {
  weekId: '529',
  title: 'Week 529',
  sourceUrl: 'https://www.joe.ie/quiz/week-529',
  questions: [
    { text: 'Capital of Ireland?', options: ['Cork', 'Dublin', 'Galway'], correctIndex: 1 },
  ],
};

function withQuestion(question: Record<string, unknown>): string {
  return JSON.stringify({ ...VALID, questions: [question] });
}

describe('parseQuizJson', () => {
  it('parses a valid quiz', () => {
    const draft = parseQuizJson(JSON.stringify(VALID));
    expect(draft.weekId).toBe('529');
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0].correctIndex).toBe(1);
  });

  it('trims whitespace', () => {
    const draft = parseQuizJson(JSON.stringify({ ...VALID, title: '  Week 529  ' }));
    expect(draft.title).toBe('Week 529');
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseQuizJson('not json')).toThrow(QuizValidationError);
  });

  it('rejects a missing title', () => {
    expect(() => parseQuizJson(JSON.stringify({ ...VALID, title: '' }))).toThrow(/title/);
  });

  it('rejects a source url that is not http or https', () => {
    expect(() => parseQuizJson(JSON.stringify({ ...VALID, sourceUrl: 'ftp://x.ie' }))).toThrow(
      /sourceUrl/,
    );
  });

  it('rejects an empty question list', () => {
    expect(() => parseQuizJson(JSON.stringify({ ...VALID, questions: [] }))).toThrow(/questions/);
  });

  it('rejects a question without exactly three options', () => {
    const json = withQuestion({ text: 'Q', options: ['a', 'b'], correctIndex: 0 });
    expect(() => parseQuizJson(json)).toThrow(/exactly 3 options/);
  });

  it('keeps an optional round and image url', () => {
    const json = withQuestion({
      text: 'Q',
      options: ['a', 'b', 'c'],
      correctIndex: 0,
      round: 'ROUND 1: Geography',
      imageUrl: 'https://assets.joe.ie/uploads/2026/11/1.webp',
    });
    const question = parseQuizJson(json).questions[0];
    expect(question.round).toBe('ROUND 1: Geography');
    expect(question.imageUrl).toBe('https://assets.joe.ie/uploads/2026/11/1.webp');
  });

  it('rejects an image url that is not a url', () => {
    const json = withQuestion({
      text: 'Q',
      options: ['a', 'b', 'c'],
      correctIndex: 0,
      imageUrl: 'nope',
    });
    expect(() => parseQuizJson(json)).toThrow(/imageUrl/);
  });

  it('rejects a correct index outside the options', () => {
    const json = withQuestion({ text: 'Q', options: ['a', 'b', 'c'], correctIndex: 3 });
    expect(() => parseQuizJson(json)).toThrow(/correctIndex/);
  });
});
