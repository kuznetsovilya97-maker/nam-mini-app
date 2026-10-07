export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type TaskStatus = 'NEW' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED' | 'EXPIRED';

export interface Task {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  category: string;
  estimatedMinutes: number;
  budgetMax: number;
}

export interface User {
  id: string;
  telegramId: number;
  name: string;
}

export interface Couple {
  id: string;
  memberIds: string[];
  level: string;
  xp: number;
  streak: number;
}
