import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// --- global middleware ---
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- routes ---
app.use('/api', routes);

// --- fallthrough handlers (order matters) ---
app.use(notFound);
app.use(errorHandler);

export default app;
