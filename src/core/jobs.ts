import { CsvFormat } from './csv/types';
import { IndexProgress } from './index/buildIndex';
import { FindQuery } from './protocol';
import { ByteSource } from './source/byteSource';

export type Job =
  | { kind: 'index'; format: CsvFormat }
  | { kind: 'search'; format: CsvFormat; query: FindQuery; limit: number };

export type JobMessage =
  { kind: 'indexProgress'; progress: IndexProgress } | { kind: 'error'; message: string };

export interface JobHandle {
  cancel(): void;
  readonly done: Promise<void>;
}

export interface JobRunner {
  run(job: Job, onMessage: (message: JobMessage) => void): JobHandle;
}

export interface JobOptions {
  chunkSize?: number;
  reportEveryChunks?: number;
}

export class InProcessJobRunner implements JobRunner {
  constructor(
    private readonly source: ByteSource,
    private readonly options: JobOptions = {}
  ) {}
  run(_job: Job, _onMessage: (message: JobMessage) => void): JobHandle {
    throw new Error('not implemented');
  }
}
