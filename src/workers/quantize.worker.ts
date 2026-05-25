import { quantize, type QuantizeInput, type QuantizeResult } from '../lib/quantize';

export interface WorkerRequest extends QuantizeInput {
  id: number;
}

export interface WorkerResponse {
  id: number;
  result: QuantizeResult;
}

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  const { id, ...input } = e.data;
  const result = quantize(input);
  const msg: WorkerResponse = { id, result };
  (self as unknown as Worker).postMessage(msg);
});
