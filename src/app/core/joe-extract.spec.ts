import { JoeExtractError, joeQuizUrl, quizFromHtml } from './joe-extract';

const PAGE = `
  <h1>The JOE Friday Pub Quiz: week 529 | JOE.ie</h1>
  <iframe src="/wpvq-embed/1286/" title="Quiz"></iframe>
`;

const EMBED = `
  <div class="wpvq-question wpvq-line">
    <div class="wpvq-question-label">ROUND 1: General Knowledge<br>How many colours?</div>
    <img class="wpvq-question-img" src="https://assets.joe.ie/uploads/2026/11/1.webp">
    <label class="vq-css-label" data-wpvq-answer="1">Nine</label>
    <label class="vq-css-label" data-wpvq-answer="2">Seven</label>
    <label class="vq-css-label" data-wpvq-answer="3">Eight</label>
  </div>
  <script>var wpvq_ans89733 = {"a1":{"1":"0","2":"1","3":"0"}};</script>
`;

describe('joeQuizUrl', () => {
  it('accepts a joe.ie quiz link', () => {
    const url = joeQuizUrl('https://www.joe.ie/quiz/the-joe-friday-pub-quiz-week-529-889400');
    expect(url.pathname).toContain('/quiz/');
  });

  it('rejects anything that is not a joe.ie quiz', () => {
    expect(() => joeQuizUrl('https://example.com/quiz/1')).toThrow(JoeExtractError);
    expect(() => joeQuizUrl('not a link')).toThrow(JoeExtractError);
  });
});

describe('quizFromHtml', () => {
  it('builds a quiz from the page and the embed', () => {
    const quiz = quizFromHtml(PAGE, EMBED, joeQuizUrl('https://www.joe.ie/quiz/week-529'));
    expect(quiz.weekId).toBe('529');
    expect(quiz.title).toBe('The JOE Friday Pub Quiz: week 529');
    expect(quiz.questions).toEqual([
      {
        round: 'ROUND 1: General Knowledge',
        text: 'How many colours?',
        options: ['Nine', 'Seven', 'Eight'],
        correctIndex: 1,
        imageUrl: 'https://assets.joe.ie/uploads/2026/11/1.webp',
      },
    ]);
  });

  it('fails when the embed has no answer key', () => {
    const embed = EMBED.replace(/<script>[^]*<\/script>/, '');
    expect(() => quizFromHtml(PAGE, embed, joeQuizUrl('https://www.joe.ie/quiz/week-529'))).toThrow(
      /answer key/,
    );
  });
});
