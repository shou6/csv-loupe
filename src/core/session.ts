import { JobRunner } from './jobs';
import { EncodingId, HostMessage, WebviewMessage } from './protocol';
import { ByteSource } from './source/byteSource';

export interface SessionEnvironment {
  readonly fileName: string;
  readonly l10n: Record<string, string> | undefined;
  open(): Promise<{ source: ByteSource; runner: JobRunner }>;
  post(message: HostMessage): void;
  copy(text: string): Promise<void>;
  openSource(line: number, encoding: EncodingId): Promise<void>;
}

export class CsvSession {
  constructor(private readonly env: SessionEnvironment) {}
  start(): Promise<void> {
    throw new Error('not implemented');
  }
  handle(_message: WebviewMessage): Promise<void> {
    throw new Error('not implemented');
  }
  fileChanged(): void {
    throw new Error('not implemented');
  }
  dispose(): Promise<void> {
    throw new Error('not implemented');
  }
}
