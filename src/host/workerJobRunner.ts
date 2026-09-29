import { Worker } from 'worker_threads';
import { Job, JobHandle, JobMessage, JobRunner } from '../core/jobs';

/** ジョブごとに Worker を起動して動かす。止めるときは Worker ごと終わらせる */
export class WorkerJobRunner implements JobRunner {
  constructor(
    /** dist/worker.js */
    private readonly workerPath: string,
    private readonly file: string
  ) {}

  run(job: Job, onMessage: (message: JobMessage) => void): JobHandle {
    const worker = new Worker(this.workerPath, { workerData: { file: this.file, job } });
    let cancelled = false;
    const done = new Promise<void>((resolve) => {
      worker.on('message', (message: JobMessage) => {
        if (!cancelled) {
          onMessage(message);
        }
      });
      worker.on('error', (error) => {
        if (!cancelled) {
          onMessage({ kind: 'error', message: error.message });
        }
      });
      worker.on('exit', () => resolve());
    });
    return {
      cancel: () => {
        cancelled = true;
        void worker.terminate();
      },
      done,
    };
  }
}
