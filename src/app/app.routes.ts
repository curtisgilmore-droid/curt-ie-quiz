import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'CURT.ie Quiz',
    loadComponent: () => import('./pages/quiz/quiz-page').then((m) => m.QuizPage),
  },
  {
    path: 'leaderboard',
    title: 'Leaderboard | CURT.ie Quiz',
    loadComponent: () =>
      import('./pages/leaderboard/leaderboard-page').then((m) => m.LeaderboardPage),
  },
  {
    path: 'admin',
    title: 'Admin | CURT.ie Quiz',
    loadComponent: () => import('./pages/admin/admin-page').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: '' },
];
