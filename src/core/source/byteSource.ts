/** ファイルの中身を範囲を指定して読む。テストではメモリ上のものに差し替える */
export interface ByteSource {
  readonly size: number;
  /** offset から最大 length バイトを読む。末尾を超えた分は返さない */
  read(offset: number, length: number): Promise<Uint8Array>;
  close(): Promise<void>;
}
