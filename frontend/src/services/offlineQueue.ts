import { get, set } from 'idb-keyval';
import { AssessmentResponse, PatientFeatures, HeartRateResult } from '../types/health';

const OFFLINE_QUEUE_KEY = 'swastik_offline_queue';

export interface QueuedAssessment {
  id: string;
  timestamp: string;
  payload: {
    language: string;
    lat: number;
    lng: number;
    features: PatientFeatures;
    heart_rate?: HeartRateResult | null;
  };
  localAssessment: AssessmentResponse;
}

// Save assessment to IndexedDB when offline
export async function queueAssessmentOffline(item: QueuedAssessment): Promise<void> {
  const existing: QueuedAssessment[] = (await get(OFFLINE_QUEUE_KEY)) || [];
  existing.push(item);
  await set(OFFLINE_QUEUE_KEY, existing);
}

// On reconnect, send each queued assessment; keep the ones that still fail.
export function setupAutoSyncListener(send: (item: QueuedAssessment) => Promise<unknown>) {
  window.addEventListener('online', async () => {
    const queue: QueuedAssessment[] = (await get(OFFLINE_QUEUE_KEY)) || [];
    const failed: QueuedAssessment[] = [];
    for (const item of queue) await send(item).catch(() => failed.push(item));
    await set(OFFLINE_QUEUE_KEY, failed);
  });
}
