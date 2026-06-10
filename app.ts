import cron from 'node-cron';
import { cronSchedule, isFeatureEnabled } from './src/config';
import {
  isRunOnceMode,
  runClassificationOnce,
  createClassificationRunner,
} from './src/process-runner';

if (isRunOnceMode()) {
  // Worker process: run a single classification with fresh @actual-app/api
  // state, then exit so the next scheduled run starts clean.
  runClassificationOnce()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Classification run failed:', error);
      process.exit(1);
    });
} else {
  if (!isFeatureEnabled('classifyOnStartup') && !cron.validate(cronSchedule)) {
    console.error('classifyOnStartup not set or invalid cron schedule:', cronSchedule);
    process.exit(1);
  }

  // Each tick spawns a fresh worker process instead of classifying in-process,
  // so long-running containers don't accumulate stale @actual-app/api state.
  const runClassification = createClassificationRunner();

  if (cron.validate(cronSchedule)) {
    cron.schedule(cronSchedule, () => {
      runClassification();
    });
  }

  console.log('Application started');
  if (isFeatureEnabled('classifyOnStartup')) {
    runClassification();
  } else {
    console.log('Application started, waiting for cron schedule:', cronSchedule);
  }
}
