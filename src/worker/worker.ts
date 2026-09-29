import { parentPort, workerData } from 'worker_threads';
import { errorMessage, Job, JobMessage, runJob } from '../core/jobs';
import { NodeFileSource } from '../core/source/nodeFileSource';

/**
 * Worker の入口。索引の作成や検索を、拡張機能ホストの主スレッドの外で行う。
 * ファイルは自分で開き直す（ファイルの読み込みを主スレッドと共有しない）。
 */
const { file, job } = workerData as { file: string; job: Job };

function post(message: JobMessage): void {
  parentPort?.postMessage(message);
}

async function main(): Promise<void> {
  const source = await NodeFileSource.open(file);
  try {
    await runJob(source, job, post);
  } finally {
    await source.close();
  }
}

main().catch((error: unknown) => post({ kind: 'error', message: errorMessage(error) }));
