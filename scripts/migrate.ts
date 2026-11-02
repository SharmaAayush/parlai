import createDataSourceDefault from '../src/server/db/data-source'; // default export is a DataSource

async function main() {
  const revert = process.argv.includes('--revert');
  const ds = await createDataSourceDefault.initialize();
  try {
    if (revert) {
      await ds.undoLastMigration({ transaction: 'each' });
      console.log('Reverted last migration');
    } else {
      const done = await ds.runMigrations({ transaction: 'each' });
      console.log(
        done.length
          ? `Applied: ${done.map((m) => m.name).join(', ')}`
          : 'No pending migrations'
      );
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});