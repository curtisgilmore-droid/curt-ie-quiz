import { Injectable } from '@angular/core';

import { fetchJoeQuiz } from './joe-extract';
import { QuizDraft } from './models';

@Injectable({ providedIn: 'root' })
export class JoeExtractService {
  extract(quizUrl: string): Promise<QuizDraft> {
    return fetchJoeQuiz(quizUrl);
  }
}
