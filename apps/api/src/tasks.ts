type TaskDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type Task = {
  id: string;
  title: string;
  description: string;
  difficulty: TaskDifficulty;
  category: string;
  estimatedMinutes: number;
  budgetMax: number;
};

export const tasks: Task[] = [
  {
    id: 'E001',
    title: 'Маленькая забота',
    description: 'Сделай сегодня за партнёра одну небольшую вещь, которую он обычно делает сам.',
    difficulty: 'EASY',
    category: 'care',
    estimatedMinutes: 10,
    budgetMax: 0
  },
  {
    id: 'E002',
    title: 'Неожиданное сообщение',
    description: 'Отправь партнёру короткое сообщение, которое точно поднимет ему настроение.',
    difficulty: 'EASY',
    category: 'care',
    estimatedMinutes: 5,
    budgetMax: 0
  },
  {
    id: 'E003',
    title: 'Любимая песня',
    description: 'Поставь любимую песню партнёра и скажи, почему она у тебя с ним ассоциируется.',
    difficulty: 'EASY',
    category: 'music',
    estimatedMinutes: 10,
    budgetMax: 0
  },
  {
    id: 'M001',
    title: 'Мини-свидание',
    description: 'Придумай небольшое свидание на 60–90 минут и возьми организацию на себя.',
    difficulty: 'MEDIUM',
    category: 'date',
    estimatedMinutes: 90,
    budgetMax: 1500
  },
  {
    id: 'M002',
    title: 'Вечер без телефонов',
    description: 'Организуйте дома один час только для вас двоих — без телефонов и других дел.',
    difficulty: 'MEDIUM',
    category: 'together',
    estimatedMinutes: 60,
    budgetMax: 500
  },
  {
    id: 'H001',
    title: 'Большой сюрприз',
    description: 'Организуй для партнёра маленькое событие, которое он действительно запомнит.',
    difficulty: 'HARD',
    category: 'surprise',
    estimatedMinutes: 240,
    budgetMax: 5000
  }
];

export function pickTask(
  difficulty: TaskDifficulty,
  excludeIds: string[] = []
): Task | null {
  const pool = tasks.filter(
    (t) => t.difficulty === difficulty && !excludeIds.includes(t.id)
  );

  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
