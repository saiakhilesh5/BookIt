import mongoose from 'mongoose';
import { env, isDev } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

async function connectWithFallback() {
  try {
    await mongoose.connect(env.MONGO_URI, {
      autoIndex: isDev || env.MONGO_URI.includes('localhost'),
      serverSelectionTimeoutMS: 4000,
    });
    logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return;
  } catch (err) {
    if (env.EMBEDDED_DB === false) throw err;
    logger.warn(`Could not reach MongoDB at ${env.MONGO_URI} (${err.message}). Falling back to embedded MongoDB...`);
  }

  // Dev convenience: spin up a local, persistent embedded MongoDB (mongodb-memory-server).
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const path = await import('node:path');
  const dbPath = path.resolve(process.cwd(), '.data/mongo');
  const mongod = await MongoMemoryServer.create({
    instanceOptions: { dbPath, storageEngine: 'wiredTiger' },
    binary: { version: '7.0.14' },
  });
  await mongoose.connect(mongod.getUri('bookit'), { autoIndex: true });
  logger.info(`Embedded MongoDB started at ${mongod.getUri('bookit')} (dbPath: ${dbPath})`);
  global.__MONGOD = mongod;
}

export async function connectDB() {
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  await connectWithFallback();
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (global.__MONGOD) await global.__MONGOD.stop();
}
