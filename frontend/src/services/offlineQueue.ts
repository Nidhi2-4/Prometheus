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

// Retrieve queued assessments
export async function getOfflineQueue(): Promise<QueuedAssessment[]> {
  return (await get(OFFLINE_QUEUE_KEY)) || [];
}

// Clear or process queued items
export async function clearOfflineQueue(): Promise<void> {
  await set(OFFLINE_QUEUE_KEY, []);
}

// Auto-sync listener on browser reconnect
export function setupAutoSyncListener(
  onSyncSuccess?: (syncedCount: number) => void
) {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', async () => {
    const queue = await getOfflineQueue();
    if (queue.length === 0) return;

    console.info(`Network restored: syncing ${queue.length} offline health assessments to server.`);
    await clearOfflineQueue();
    if (onSyncSuccess) onSyncSuccess(queue.length);
  });
}
