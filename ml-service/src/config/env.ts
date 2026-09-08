import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4100),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4000',
};
