import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { mlRouter } from './routes/ml.routes.js';

/**
 * Pure computation service: every hand-rolled predictive/analytics
 * algorithm from the original monolith backend (flight risk, sentiment/
 * Tier-0, anomaly detection, headcount forecast, ONA graph, compensation
 * sandbox, shift optimization, resource reallocation) now lives here.
 * It never touches Supabase — the backend fetches data, POSTs it here as
 * JSON, and gets the computed result back. This is not exposed to the
 * public internet; only the backend container talks to it (see
 * docker-compose.yml — no published host port).
 */
const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'hr-intel-ml-service' }));

app.use('/', mlRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err?.status ?? 500).json({ error: err?.message ?? 'Internal server error' });
});

app.listen(env.port, () => {
  console.log(`HR Intelligence ML service listening on http://localhost:${env.port}`);
});
