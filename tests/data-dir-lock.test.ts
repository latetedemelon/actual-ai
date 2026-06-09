import fs from 'fs';
import os from 'os';
import path from 'path';
import ActualApiService from '../src/actual-api-service';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'actual-ai-lock-test-'));
}

function makeClient(): typeof import('@actual-app/api') {
  const asyncNoop = jest.fn(async () => Promise.resolve());
  return {
    init: asyncNoop,
    downloadBudget: asyncNoop,
    shutdown: asyncNoop,
    getCategoryGroups: jest.fn(),
    getCategories: jest.fn(),
    getPayees: jest.fn(),
    getAccounts: jest.fn(),
    getTransactions: jest.fn(),
    getRules: jest.fn(),
    getPayeeRules: jest.fn(),
    createRule: jest.fn(),
    updateTransaction: jest.fn(),
    runBankSync: jest.fn(),
    createCategory: jest.fn(),
    createCategoryGroup: jest.fn(),
    updateCategoryGroup: jest.fn(),
  } as unknown as typeof import('@actual-app/api');
}

describe('ActualApiService dataDir lock', () => {
  test('prevents concurrent runs from sharing the same dataDir', async () => {
    const dataDir = makeTmpDir();

    const client = makeClient();

    const s1 = new ActualApiService(
      client,
      fs,
      dataDir,
      'http://example.com',
      'pw',
      'budget',
      '',
      true,
    );
    const s2 = new ActualApiService(
      client,
      fs,
      dataDir,
      'http://example.com',
      'pw',
      'budget',
      '',
      true,
    );

    await s1.initializeApi();

    await expect(s2.initializeApi()).rejects.toThrow(/Refusing to use shared dataDir/i);

    await s1.shutdownApi();

    // After the first run releases the lock, the second should be able to initialize.
    await expect(s2.initializeApi()).resolves.toBeUndefined();
    await s2.shutdownApi();
  });

  test('clears a stale lock from a crashed run whose PID was reused (container restart)', async () => {
    const dataDir = makeTmpDir();
    const lockPath = path.join(dataDir, '.actual-ai.lock');

    // Simulate a lock left behind by a previous run that crashed without
    // releasing it. The PID matches the current (restarted) process — as can
    // happen in a fresh container PID namespace — so a naive liveness probe
    // would wrongly conclude the run is still active. The startedAt predates
    // this process, marking the lock as stale.
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }));

    const service = new ActualApiService(
      makeClient(),
      fs,
      dataDir,
      'http://example.com',
      'pw',
      'budget',
      '',
      true,
    );

    await expect(service.initializeApi()).resolves.toBeUndefined();
    await service.shutdownApi();
  });

  test('unparseable lock is treated as stale and cleared', async () => {
    const dataDir = makeTmpDir();
    const lockPath = path.join(dataDir, '.actual-ai.lock');
    fs.writeFileSync(lockPath, 'not-json');

    const service = new ActualApiService(
      makeClient(),
      fs,
      dataDir,
      'http://example.com',
      'pw',
      'budget',
      '',
      true,
    );

    await expect(service.initializeApi()).resolves.toBeUndefined();
    await service.shutdownApi();
  });
});
