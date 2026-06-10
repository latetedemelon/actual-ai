import {
  spawn as defaultSpawn, ChildProcess, SpawnOptions,
} from 'child_process';

// When this env var is set, the process runs a single classification and exits,
// rather than acting as the long-lived scheduler.
export const RUN_ONCE_ENV = 'ACTUAL_AI_RUN_ONCE';

export function isRunOnceMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[RUN_ONCE_ENV] === 'true';
}

export async function runClassificationOnce(): Promise<void> {
  // Imported lazily so the long-lived scheduler process never loads
  // @actual-app/api. Each classification runs in a fresh worker process, which
  // avoids @actual-app/api's module-level singleton state drifting across many
  // cron cycles — the drift otherwise makes scheduled syncs silently return no
  // new transactions over long container uptimes (upstream issue #424).
  const { default: actualAi } = await import('./container');
  await actualAi.classify();
}

type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

/**
 * Returns a function that spawns a fresh "run once" worker process for each
 * scheduled tick. Overlapping ticks are skipped while a worker is still running
 * (the dataDir lock would reject a concurrent run anyway).
 */
export function createClassificationRunner(spawnFn: SpawnFn = defaultSpawn): () => void {
  let runInFlight = false;

  return () => {
    if (runInFlight) {
      console.warn('Previous classification run still in progress; skipping this tick');
      return;
    }

    runInFlight = true;
    const child = spawnFn(process.execPath, process.argv.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, [RUN_ONCE_ENV]: 'true' },
    });

    child.on('exit', (code) => {
      runInFlight = false;
      if (code !== 0) {
        console.error(`Classification run exited with code ${code ?? 'null'}`);
      }
    });

    child.on('error', (error) => {
      runInFlight = false;
      console.error('Failed to start classification run:', error);
    });
  };
}
