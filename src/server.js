const app = require('./app');
const { pool, initSchema } = require('./db/postgres');
const { connectMongo, mongoose } = require('./db/mongo');

const PORT = Number(process.env.PORT || 3000);

// Databases may still be starting (docker compose / Kubernetes) - retry for a while
async function retry(fn, name, attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (err) {
      console.log(`[${name}] not ready (${i}/${attempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`${name} is unavailable`);
}

async function main() {
  await retry(initSchema, 'postgres');
  await retry(connectMongo, 'mongodb');
  const server = app.listen(PORT, () => console.log(`SprintBoard running on http://localhost:${PORT}`));

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await pool.end();
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => { console.error(err); process.exit(1); });
