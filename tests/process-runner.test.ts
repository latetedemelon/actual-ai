import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import {
  isRunOnceMode,
  createClassificationRunner,
  RUN_ONCE_ENV,
} from '../src/process-runner';

describe('process-runner', () => {
  describe('isRunOnceMode', () => {
    it('is true when the env flag is set to "true"', () => {
      expect(isRunOnceMode({ [RUN_ONCE_ENV]: 'true' })).toBe(true);
    });

    it('is false otherwise', () => {
      expect(isRunOnceMode({})).toBe(false);
      expect(isRunOnceMode({ [RUN_ONCE_ENV]: 'false' })).toBe(false);
    });
  });

  describe('createClassificationRunner', () => {
    it('spawns a fresh run-once worker with the current argv and env flag', () => {
      const child = new EventEmitter() as ChildProcess;
      const spawnFn = jest.fn((
        _cmd: string,
        _args: string[],
        _opts: { env: Record<string, string | undefined>; stdio: string },
      ) => child);

      const run = createClassificationRunner(spawnFn as never);
      run();

      expect(spawnFn).toHaveBeenCalledTimes(1);
      const [command, args, options] = spawnFn.mock.calls[0];
      expect(command).toBe(process.execPath);
      expect(args).toEqual(process.argv.slice(1));
      expect(options.env[RUN_ONCE_ENV]).toBe('true');
      expect(options.stdio).toBe('inherit');
    });

    it('skips overlapping ticks until the running worker exits', () => {
      const child = new EventEmitter() as ChildProcess;
      const spawnFn = jest.fn(() => child);

      const run = createClassificationRunner(spawnFn as never);
      run();
      run(); // worker still running → skipped
      expect(spawnFn).toHaveBeenCalledTimes(1);

      child.emit('exit', 0); // worker finished
      run();
      expect(spawnFn).toHaveBeenCalledTimes(2);
    });

    it('resets after a worker error so the next tick can spawn', () => {
      const child = new EventEmitter() as ChildProcess;
      const spawnFn = jest.fn(() => child);

      const run = createClassificationRunner(spawnFn as never);
      run();
      child.emit('error', new Error('spawn failed'));
      run();
      expect(spawnFn).toHaveBeenCalledTimes(2);
    });
  });
});
