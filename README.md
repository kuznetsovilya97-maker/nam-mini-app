# НАМ — Telegram Mini App

MVP v0.3: игровое ядро недели для пар.

## Что работает в ядре
- у пары 2 участника;
- каждому независимо выдаются 2 Easy + 1 Medium;
- Hard имеет отдельную вероятность для каждого партнёра;
- задания не совпадают внутри пары и стараются не повторяться в истории пользователя;
- задания имеют `slot`, поэтому два Easy могут существовать одновременно;
- у заданий есть запланированное время выдачи;
- пользователь видит только свои миссии;
- после выполнения всех 6 обязательных миссий открывается общий reveal;
- XP начисляется за выполнение.

## Запуск
1. Установить Node.js 20+ и PostgreSQL.
2. Скопировать `apps/api/.env.example` в `apps/api/.env` и заполнить `DATABASE_URL`, `BOT_TOKEN`, `BOT_USERNAME`, `WEB_APP_URL`.
3. `npm install`
4. `npm run --workspace apps/api prisma:generate`
5. `npm run --workspace apps/api prisma:migrate`
6. `npm run --workspace apps/api prisma:seed`
7. `npm run dev:api`
8. Во втором терминале: `npm run dev:web`

Для локального demo API разрешает заголовок `x-demo-user-id`, если `NODE_ENV` не равен production.
