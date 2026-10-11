import pino from 'pino';
import { isDev, isTest } from '../config/env.js';

const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.passwordHash',
    '*.card.number',
    'card.number',
    '*.refreshToken',
    '*.refreshTokenHash',
  ],
  censor: '[redacted]',
};

export const logger = pino(
  {
    level: isTest ? 'silent' : isDev ? 'debug' : 'info',
    redact,
  },
  isDev
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } })
    : undefined,
);
