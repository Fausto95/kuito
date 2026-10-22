// Turn a permission result into an actionable message.
import { permissions, type PermissionResponse, type PermissionStatus } from 'kuito';

export async function cameraAccess(): Promise<string> {
  const result: PermissionResponse = await permissions.request('camera');
  const status: PermissionStatus = result.status;
  if (status === 'granted') return 'Camera ready';
  return result.canAskAgain ? 'Camera access was declined' : 'Enable camera access in Settings';
}
