import { closePool, getCheckpointStatus, getResolvedDatabaseUrl, getSqliteFilePath, initializeDatabaseDefaults } from './db.js';

async function main() {
  await initializeDatabaseDefaults();
  const status = await getCheckpointStatus();
  console.info('[info] db:status', {
    databaseUrl: getResolvedDatabaseUrl(),
    sqliteFilePath: getSqliteFilePath(),
    checkpointCount: status.count,
    lastCheckpoint: status.last
      ? {
          id: status.last.id,
          sourceProvider: status.last.sourceProvider,
          configKey: status.last.configKey,
          nextBatchId: status.last.nextBatchId,
          lastCompletedBatchId: status.last.lastCompletedBatchId,
          status: status.last.status,
          updatedAt: status.last.updatedAt
        }
      : null
  });
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
