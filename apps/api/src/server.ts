import Fastify from 'fastify';
import cors from '@fastify/cors';
import crypto from 'node:crypto';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { tasks, pickTask } from './tasks.js';

const Difficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD'
} as const;

type Difficulty = typeof Difficulty[keyof typeof Difficulty];

const AssignmentStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED'
} as const;

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

function validateTelegramInitData(
  initData: string,
  botToken: string
) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) return null;

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculated = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (
    !crypto.timingSafeEqual(
      Buffer.from(calculated),
      Buffer.from(hash)
    )
  ) {
    return null;
  }

  const authDate = Number(
    params.get('auth_date') ?? 0
  );

  if (
    !authDate ||
    Date.now() / 1000 - authDate > 86400
  ) {
    return null;
  }

  const userRaw = params.get('user');

  if (!userRaw) return null;

  return JSON.parse(userRaw) as {
    id: number;
    first_name?: string;
    username?: string;
  };
}

async function getUserFromRequest(request: any) {
  const botToken = process.env.BOT_TOKEN;
  const initData =
    request.headers['x-telegram-init-data'];

  if (botToken && initData) {
    return validateTelegramInitData(
      String(initData),
      botToken
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    const demoId =
      request.headers['x-demo-user-id'];

    if (demoId) {
      return {
        id: Number(demoId),
        first_name: 'Demo'
      };
    }
  }

  return null;
}

async function upsertUser(
  tgUser: {
    id: number;
    first_name?: string;
  }
) {
  return prisma.user.upsert({
    where: {
      telegramId: BigInt(tgUser.id)
    },
    update: {
      name:
        tgUser.first_name ||
        'Пользователь'
    },
    create: {
      telegramId: BigInt(tgUser.id),
      name:
        tgUser.first_name ||
        'Пользователь'
    }
  });
}

app.get('/health', async () => ({
  ok: true,
  app: 'nam',
  version: '0.2.0'
}));

app.post('/api/auth', async (request, reply) => {
  const tgUser =
    await getUserFromRequest(request);

  if (!tgUser) {
    return reply
      .code(401)
      .send({
        error: 'Telegram auth required'
      });
  }

  const user = await upsertUser(tgUser);

  return {
    user: {
      id: user.id,
      name: user.name
    }
  };
});

app.post(
  '/api/couples',
  async (request, reply) => {
    const tgUser =
      await getUserFromRequest(request);

    if (!tgUser) {
      return reply
        .code(401)
        .send({
          error: 'Telegram auth required'
        });
    }

    const body = z
      .object({
        partnerName: z
          .string()
          .min(1)
          .max(80),
        relationshipStart: z
          .string()
          .datetime()
          .optional()
      })
      .parse(request.body);

    const user =
      await upsertUser(tgUser);

    const couple =
      await prisma.couple.create({
        data: {
          relationshipStart:
            body.relationshipStart
              ? new Date(
                  body.relationshipStart
                )
              : undefined,
          members: {
            create: {
              userId: user.id
            }
          }
        }
      });

    return {
      coupleId: couple.id,
      inviteToken:
        couple.inviteToken,
      inviteUrl:
        `https://t.me/${process.env.BOT_USERNAME ?? 'YOUR_BOT'}?startapp=pair_${couple.inviteToken}`
    };
  }
);

app.post(
  '/api/couples/join',
  async (request, reply) => {
    const tgUser =
      await getUserFromRequest(request);

    if (!tgUser) {
      return reply
        .code(401)
        .send({
          error: 'Telegram auth required'
        });
    }

    const body = z
      .object({
        inviteToken:
          z.string().min(1)
      })
      .parse(request.body);

    const user =
      await upsertUser(tgUser);

    const couple =
      await prisma.couple.findUnique({
        where: {
          inviteToken:
            body.inviteToken
        },
        include: {
          members: true
        }
      });

    if (!couple) {
      return reply
        .code(404)
        .send({
          error: 'Invite not found'
        });
    }

    if (
      couple.members.some(
        m => m.userId === user.id
      )
    ) {
      return {
        coupleId: couple.id,
        alreadyMember: true
      };
    }

    if (couple.members.length >= 2) {
      return reply
        .code(409)
        .send({
          error: 'Couple is full'
        });
    }

    await prisma.coupleMember.create({
      data: {
        coupleId: couple.id,
        userId: user.id
      }
    });

    return {
      coupleId: couple.id,
      joined: true
    };
  }
);

function weekBounds(
  now = new Date()
) {
  const d = new Date(now);
  const day = d.getUTCDay();
  const diff =
    day === 0 ? -6 : 1 - day;

  const start = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + diff
    )
  );

  const end = new Date(start);

  end.setUTCDate(
    end.getUTCDate() + 7
  );

  return {
    start,
    end
  };
}

async function getCurrentWeek(
  coupleId: string
) {
  const { start, end } =
    weekBounds();

  return prisma.week.upsert({
    where: {
      coupleId_startsAt: {
        coupleId,
        startsAt: start
      }
    },
    update: {},
    create: {
      coupleId,
      startsAt: start,
      endsAt: end
    }
  });
}

app.get(
  '/api/couples/:id',
  async (request, reply) => {
    const tgUser =
      await getUserFromRequest(request);

    if (!tgUser) {
      return reply
        .code(401)
        .send({
          error: 'Telegram auth required'
        });
    }

    const user =
      await upsertUser(tgUser);

    const params = z
      .object({
        id: z.string()
      })
      .parse(request.params);

    const couple =
      await prisma.couple.findUnique({
        where: {
          id: params.id
        },
        include: {
          members: {
            include: {
              user: true
            }
          }
        }
      });

    if (
      !couple ||
      !couple.members.some(
        m => m.userId === user.id
      )
    ) {
      return reply
        .code(404)
        .send({
          error: 'Couple not found'
        });
    }

    return {
      id: couple.id,
      level: couple.level,
      xp: couple.xp,
      streak: couple.streak,
      members:
        couple.members.map(m => ({
          id: m.user.id,
          name: m.user.name
        }))
    };
  }
);

const SLOT_DIFFICULTY: Record<
  string,
  Difficulty
> = {
  EASY_1: Difficulty.EASY,
  EASY_2: Difficulty.EASY,
  MEDIUM_1: Difficulty.MEDIUM,
  HARD_1: Difficulty.HARD
};

function addHours(
  date: Date,
  hours: number
) {
  return new Date(
    date.getTime() +
      hours * 60 * 60 * 1000
  );
}

async function ensureTaskInDb(
  task: ReturnType<typeof pickTask>
) {
  if (!task) return null;

  return prisma.task.upsert({
    where: {
      id: task.id
    },
    update: {},
    create: {
      ...task,
      difficulty:
        task.difficulty as Difficulty
    }
  });
}

async function chooseAssignmentTask(
  coupleId: string,
  difficulty: Difficulty,
  userId: string
) {
  const used =
    await prisma.assignment.findMany({
      where: {
        coupleId
      },
      select: {
        taskId: true
      }
    });

  const recentMine =
    await prisma.assignment.findMany({
      where: {
        coupleId,
        userId
      },
      orderBy: {
        issuedAt: 'desc'
      },
      take: 8,
      select: {
        taskId: true
      }
    });

  const exclude = [
    ...new Set([
      ...used.map(
        a => a.taskId
      ),
      ...recentMine.map(
        a => a.taskId
      )
    ])
  ];

  const task =
    pickTask(
      difficulty,
      exclude
    ) ??
    pickTask(
      difficulty,
      used.map(
        a => a.taskId
      )
    );

  return ensureTaskInDb(task);
}

function randomSchedule(
  week: {
    startsAt: Date;
    endsAt: Date;
  },
  slot: string,
  userId: string
) {
  const seed = [
    ...slot + userId
  ].reduce(
    (a, c) =>
      a + c.charCodeAt(0),
    0
  );

  const dayOffset =
    seed % 7;

  const hour =
    10 + (seed % 10);

  const minute =
    (seed * 17) % 60;

  const date =
    new Date(week.startsAt);

  date.setUTCDate(
    date.getUTCDate() +
      dayOffset
  );

  date.setUTCHours(
    hour,
    minute,
    0,
    0
  );

  if (
    date >= week.endsAt
  ) {
    return addHours(
      week.startsAt,
      2
    );
  }

  return date;
}

async function ensureWeeklyAssignments(
  coupleId: string
) {
  const members =
    await prisma.coupleMember.findMany({
      where: {
        coupleId
      },
      orderBy: {
        joinedAt: 'asc'
      }
    });

  if (members.length !== 2) {
    return {
      ready: false,
      reason:
        'waiting_for_partner'
    };
  }

  const week =
    await getCurrentWeek(
      coupleId
    );

  const slots = [
    'EASY_1',
    'EASY_2',
    'MEDIUM_1'
  ];

  const result: any[] = [];

  for (const member of members) {
    for (const slot of slots) {
      const existing =
        await prisma.assignment.findUnique({
          where: {
            userId_weekId_slot: {
              userId:
                member.userId,
              weekId:
                week.id,
              slot
            }
          },
          include: {
            task: true
          }
        });

      if (existing) {
        result.push(existing);
        continue;
      }

      const task =
        await chooseAssignmentTask(
          coupleId,
          SLOT_DIFFICULTY[
            slot
          ],
          member.userId
        );

      if (!task) continue;

      const assignment =
        await prisma.assignment.create({
          data: {
            coupleId,
            userId:
              member.userId,
            weekId:
              week.id,
            taskId:
              task.id,
            difficulty:
              SLOT_DIFFICULTY[
                slot
              ],
            slot,
            scheduledAt:
              randomSchedule(
                week,
                slot,
                member.userId
              )
          },
          include: {
            task: true
          }
        });

      result.push(
        assignment
      );
    }

    const hardChance =
      0.35;

    if (
      Math.random() <
      hardChance
    ) {
      const existingHard =
        await prisma.assignment.findUnique({
          where: {
            userId_weekId_slot: {
              userId:
                member.userId,
              weekId:
                week.id,
              slot: 'HARD_1'
            }
          },
          include: {
            task: true
          }
        });

      if (!existingHard) {
        const task =
          await chooseAssignmentTask(
            coupleId,
            Difficulty.HARD,
            member.userId
          );

        if (task) {
          result.push(
            await prisma.assignment.create({
              data: {
                coupleId,
                userId:
                  member.userId,
                weekId:
                  week.id,
                taskId:
                  task.id,
                difficulty:
                  Difficulty.HARD,
                slot: 'HARD_1',
                scheduledAt:
                  randomSchedule(
                    week,
                    'HARD_1',
                    member.userId
                  )
              },
              include: {
                task: true
              }
            })
          );
        }
      }
    }
  }

  return {
    ready: true,
    weekId: week.id,
    assignments:
      result
  };
}

app.post(
  '/api/weeks/ensure',
  async (request, reply) => {
    const tgUser =
      await getUserFromRequest(request);

    if (!tgUser) {
      return reply
        .code(401)
        .send({
          error:
            'Telegram auth required'
        });
    }

    const body = z
      .object({
        coupleId:
          z.string()
      })
      .parse(
        request.body
      );

    const user =
      await upsertUser(tgUser);

    const membership =
      await prisma.coupleMember.findUnique({
        where: {
          coupleId_userId: {
            coupleId:
              body.coupleId,
            userId:
              user.id
          }
        }
      });

    if (!membership) {
      return reply
        .code(403)
        .send({
          error:
            'Not a couple member'
        });
    }

    return ensureWeeklyAssignments(
      body.coupleId
    );
  }
);

app.get(
  '/api/weeks/current',
  async (request, reply) => {
    const tgUser =
      await getUserFromRequest(
        request
      );

    if (!tgUser) {
      return reply
        .code(401)
        .send({
          error:
            'Telegram auth required'
        });
    }

    const query = z
      .object({
        coupleId:
          z.string()
      })
      .parse(
        request.query
      );

    const user =
      await upsertUser(tgUser);

    const membership =
      await prisma.coupleMember.findUnique({
        where: {
          coupleId_userId: {
            coupleId:
              query.coupleId,
            userId:
              user.id
          }
        }
      });

    if (!membership) {
      return reply
        .code(403)
        .send({
          error:
            'Not a couple member'
        });
    }

    const week =
      await getCurrentWeek(
        query.coupleId
      );

    await ensureWeeklyAssignments(
      query.coupleId
    );

    const assignments =
      await prisma.assignment.findMany({
        where: {
          weekId: week.id,
          userId:
            user.id
        },
        include: {
          task: true
        },
        orderBy: {
          scheduledAt:
            'asc'
        }
      });

    return {
      week,
      assignments
    };
  }
);

app.post(
  '/api/assignments/:id/complete',
  async (request, reply) => {
    const tgUser =
      await getUserFromRequest(
        request
      );

    if (!tgUser) {
      return reply
        .code(401)
        .send({
          error:
            'Telegram auth required'
        });
    }

    const user =
      await upsertUser(tgUser);

    const params = z
      .object({
        id: z.string()
      })
      .parse(
        request.params
      );

    const assignment =
      await prisma.assignment.findUnique({
        where: {
          id: params.id
        }
      });

    if (
      !assignment ||
      assignment.userId !==
        user.id
    ) {
      return reply
        .code(404)
        .send({
          error:
            'Assignment not found'
        });
    }

    if (
      assignment.status ===
      AssignmentStatus.COMPLETED
    ) {
      return {
        ok: true,
        alreadyCompleted:
          true
      };
    }

    const updated =
      await prisma.assignment.update({
        where: {
          id: assignment.id
        },
        data: {
          status:
            AssignmentStatus.COMPLETED,
          completedAt:
            new Date()
        }
      });

    const xp =
      assignment.difficulty ===
      Difficulty.HARD
        ? 30
        : assignment.difficulty ===
          Difficulty.MEDIUM
          ? 20
          : 10;

    await prisma.couple.update({
      where: {
        id:
          assignment.coupleId
      },
      data: {
        xp: {
          increment: xp
        }
      }
    });

    const weekAssignments =
      await prisma.assignment.findMany({
        where: {
          coupleId:
            assignment.coupleId,
          weekId:
            assignment.weekId
        }
      });

    const members =
      await prisma.coupleMember.count({
        where: {
          coupleId:
            assignment.coupleId
        }
      });

    const required =
      weekAssignments.filter(
        a =>
          [
            'EASY_1',
            'EASY_2',
            'MEDIUM_1'
          ].includes(a.slot)
      );

    const bothCompleted =
      members === 2 &&
      required.length === 6 &&
      required.every(
        a =>
          a.status ===
          AssignmentStatus.COMPLETED
      );

    return {
      ok: true,
      assignment: updated,
      bothCompleted
    };
  }
);

app.get(
  '/api/weeks/:weekId/reveal',
  async (request, reply) => {
    const tgUser =
      await getUserFromRequest(
        request
      );

    if (!tgUser) {
      return reply
        .code(401)
        .send({
          error:
            'Telegram auth required'
        });
    }

    const user =
      await upsertUser(tgUser);

    const params = z
      .object({
        weekId:
          z.string()
      })
      .parse(
        request.params
      );

    const week =
      await prisma.week.findUnique({
        where: {
          id: params.weekId
        }
      });

    if (!week) {
      return reply
        .code(404)
        .send({
          error:
            'Week not found'
        });
    }

    const membership =
      await prisma.coupleMember.findUnique({
        where: {
          coupleId_userId: {
            coupleId:
              week.coupleId,
            userId:
              user.id
          }
        }
      });

    if (!membership) {
      return reply
        .code(403)
        .send({
          error:
            'Not a couple member'
        });
    }

    const all =
      await prisma.assignment.findMany({
        where: {
          weekId:
            week.id,
          slot: {
            in: [
              'EASY_1',
              'EASY_2',
              'MEDIUM_1'
            ]
          }
        },
        include: {
          task: true,
          user: true
        },
        orderBy: [
          {
            userId:
              'asc'
          },
          {
            slot:
              'asc'
          }
        ]
      });

    if (
      all.length < 6 ||
      !all.every(
        a =>
          a.status ===
          AssignmentStatus.COMPLETED
      )
    ) {
      return reply
        .code(409)
        .send({
          error:
            'Reveal is locked'
        });
    }

    return {
      assignments:
        all.map(a => ({
          id: a.id,
          userId:
            a.userId,
          userName:
            a.user.name,
          slot: a.slot,
          difficulty:
            a.difficulty,
          task: a.task
        }))
    };
  }
);

const port = Number(process.env.PORT ?? 3000);

await app.listen({
  port,
  host: '0.0.0.0'
});
