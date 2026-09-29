import { CsvFormat } from './csv/types';
import { buildIndex, IndexProgress } from './index/buildIndex';
import { ByteSource } from './source/byteSource';

/** 時間のかかる処理。本番では Worker で、テストと file 以外のスキームではその場で動かす */
export type Job = { kind: 'index'; format: CsvFormat };

export type JobMessage =
  { kind: 'indexProgress'; progress: IndexProgress } | { kind: 'error'; message: string };

export interface JobHandle {
  /** 止める。止めた後はメッセージを知らせない */
  cancel(): void;
  /** 処理が終わる（止まる）と解決する */
  readonly done: Promise<void>;
}

export interface JobRunner {
  run(job: Job, onMessage: (message: JobMessage) => void): JobHandle;
}

export interface JobOptions {
  chunkSize?: number;
  reportEveryChunks?: number;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** ジョブを実行する。Worker とその場での実行の両方がこれを使う */
export async function runJob(
  source: ByteSource,
  job: Job,
  post: (message: JobMessage) => void,
  shouldStop: () => boolean = () => false,
  options: JobOptions = {}
): Promise<void> {
  switch (job.kind) {
    case 'index':
      await buildIndex(source, job.format, {
        chunkSize: options.chunkSize,
        reportEveryChunks: options.reportEveryChunks,
        shouldStop,
        onProgress: (progress) => post({ kind: 'indexProgress', progress }),
      });
      break;
  }
}

/** その場（拡張機能ホストのスレッド）で動かす。チャンクの読み込みごとに他の処理へ譲る */
export class InProcessJobRunner implements JobRunner {
  constructor(
    private readonly source: ByteSource,
    private readonly options: JobOptions = {}
  ) {}

  run(job: Job, onMessage: (message: JobMessage) => void): JobHandle {
    let cancelled = false;
    const post = (message: JobMessage) => {
      if (!cancelled) {
        onMessage(message);
      }
    };
    const done = runJob(this.source, job, post, () => cancelled, this.options).catch(
      (error: unknown) => post({ kind: 'error', message: errorMessage(error) })
    );
    return {
      cancel: () => {
        cancelled = true;
      },
      done,
    };
  }
}
