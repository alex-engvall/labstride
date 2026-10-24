export class UnixRpc {
  constructor(path: string, timeoutMs?: number);
  onNotification: (value: any) => void;
  onDisconnect: () => void;
  open(): Promise<void>;
  call(method: string, params: unknown): Promise<any>;
  notify(method: string, params: unknown): void;
  frame(opcode: number, payload: Buffer): void;
  close(): void;
}
