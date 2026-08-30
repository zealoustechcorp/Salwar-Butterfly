# backend

Express 5 + PostgreSQL (`pg`) API for Salwar Butterfly.

## Setup

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npm install
npm run db:check       # verifies the PostgreSQL connection
npm run db:migrate     # applies src/migrations/*.sql in order
npm run dev            # http://localhost:4000
```

### Creating an admin

There is no admin sign-up endpoint — accounts are provisioned from
the CLI. Omit `--password` and the script prompts for it with the
input masked, so the password never reaches your shell history:

```bash
npm run admin:create -- --name "Your Name" --email you@example.com --role super_admin
```

Roles are `admin` and `super_admin`.

## Structure

```
backend/
├── .env.example            # template — copy to .env (git-ignored)
├── package.json
└── src/
    ├── server.js           # http server, startup DB check, graceful shutdown
    ├── app.js              # express app: middleware + route mounting
    ├── config/
    │   ├── env.js          # validated environment config
    │   └── db.js           # pg Pool, query(), withTransaction(), connectDb(), closeDb()
    ├── routes/
    │   ├── index.js        # mounts feature routers under /api
    │   └── health.routes.js
    ├── controllers/        # req/res handling only
    │   └── health.controller.js
    ├── services/           # business logic (calls models)
    ├── models/             # SQL / data access (uses config/db.js)
    ├── validators/         # request schema validation
    ├── middlewares/
    │   ├── notFound.js
    │   └── errorHandler.js
    ├── utils/
    │   ├── ApiError.js
    │   └── asyncHandler.js
    └── scripts/
        └── checkDb.js      # npm run db:check
```

Request flow: `routes → validators → controllers → services → models → db`.

## Endpoints

| Method | Path                      | Auth        | Description                        |
| ------ | ------------------------- | ----------- | ---------------------------------- |
| GET    | `/api/health`             | —           | process liveness                   |
| GET    | `/api/health/db`          | —           | database reachability              |
| POST   | `/api/admin/auth/login`   | —           | issue an admin JWT (10 req/15 min) |
| GET    | `/api/admin/auth/me`      | admin token | the signed-in admin                |
| POST   | `/api/admin/auth/logout`  | admin token | audit-only; the client drops the token |

Admin tokens carry `typ: "admin"`. Because every token in the system
is signed with the same `JWT_SECRET`, `requireAdmin` checks that claim
— without it a storefront customer token would verify perfectly well
against an admin route.
