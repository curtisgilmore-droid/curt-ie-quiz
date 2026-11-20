import { vi } from 'vitest';

import {
  JoeExtractError,
  joeQuizUrl,
  latestFridayQuizUrl,
  quizFromHtml,
  syncLatestQuiz,
} from './joe-extract';

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

  it('picks the highest Friday Pub Quiz week from the index', () => {
    const index = `
      <a href="/quiz/the-joe-friday-pub-quiz-week-529-889400">529</a>
      <a href="https://www.joe.ie/quiz/the-joe-friday-pub-quiz-week-530-889920">530</a>
      <a href="https://www.joe.ie/quiz/the-joe-film-club-quiz-week-122">film</a>
    `;
    expect(latestFridayQuizUrl(index)).toBe(
      'https://www.joe.ie/quiz/the-joe-friday-pub-quiz-week-530-889920',
    );
  });

  it('publishes a newly discovered week and skips the same week', async () => {
    const pages: Record<string, string> = {
      'https://www.joe.ie/quiz/':
        '<a href="https://www.joe.ie/quiz/the-joe-friday-pub-quiz-week-530-889920">530</a>',
      'https://www.joe.ie/quiz/the-joe-friday-pub-quiz-week-530-889920':
        '<h1>The JOE Friday Pub Quiz: week 530</h1><iframe src="/wpvq-embed/9/"></iframe>',
      'https://www.joe.ie/wpvq-embed/9/': EMBED,
    };
    const fetchPage = async (url: string) => {
      const html = pages[url];
      if (!html) {
        throw new Error(`unexpected ${url}`);
      }
      return html;
    };
    const published: string[] = [];
    const store = {
      getCurrent: async (): Promise<{ weekId: string; title: string } | null> => null,
      publish: async (quiz: { weekId: string }) => {
        published.push(quiz.weekId);
      },
    };

    const first = await syncLatestQuiz(store, fetchPage);
    expect(first.status).toBe('published');
    expect(published).toEqual(['530']);

    store.getCurrent = async () => ({ weekId: '530', title: 'Week 530' });
    const second = await syncLatestQuiz(store, fetchPage);
    expect(second.status).toBe('unchanged');
    expect(published).toEqual(['530']);
  });

  it('does not publish when the quiz index cannot be read', async () => {
    const publish = vi.fn();
    await expect(
      syncLatestQuiz(
        { getCurrent: async () => ({ weekId: '529', title: 'Week 529' }), publish },
        async () => {
          throw new JoeExtractError('Could not reach JOE.ie: down');
        },
      ),
    ).rejects.toThrow(/Could not reach JOE.ie/);
    expect(publish).not.toHaveBeenCalled();
  });

  it('fails when the embed has no answer key', () => {
    const embed = EMBED.replace(/<script>[^]*<\/script>/, '');
    expect(() => quizFromHtml(PAGE, embed, joeQuizUrl('https://www.joe.ie/quiz/week-529'))).toThrow(
      /answer key/,
    );
  });
});
