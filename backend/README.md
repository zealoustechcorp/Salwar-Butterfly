# backend

Express 5 + PostgreSQL (`pg`) API for Salwar Butterfly.

## Setup

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL
npm install
npm run db:check       # verifies the PostgreSQL connection
npm run dev            # http://localhost:4000
```

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

| Method | Path             | Description             |
| ------ | ---------------- | ----------------------- |
| GET    | `/api/health`    | process liveness        |
| GET    | `/api/health/db` | database reachability   |
