import { PrismaClient } from '@prisma/client';
import { tasks } from '../src/tasks.js';
const prisma = new PrismaClient();
for (const task of tasks) {
  await prisma.task.upsert({ where: { id: task.id }, update: { active: true }, create: { ...task, difficulty: task.difficulty } });
}
await prisma.$disconnect();
