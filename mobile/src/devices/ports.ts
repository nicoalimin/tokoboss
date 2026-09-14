/**
 * Device ports (UTA-13).
 *
 * Every native capability is behind a small, testable port. Denial or
 * absence never throws and never crashes — adapters return a recoverable
 * `DeviceResult` carrying UI-ready recovery copy instead.
 */

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export type DeviceFailureReason =
  'permission-denied' | 'unavailable' | 'cancelled';

export type DeviceResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: DeviceFailureReason; recovery: string };

export interface CameraPort {
  permission: () => Promise<PermissionState>;
  requestPermission: () => Promise<PermissionState>;
  capturePhoto: () => Promise<DeviceResult<{ uri: string }>>;
}

export interface BarcodePort {
  scan: () => Promise<DeviceResult<{ value: string; format: string }>>;
}

export interface PhotoUploadPort {
  upload: (localUri: string) => Promise<DeviceResult<{ remoteId: string }>>;
}

export interface NotificationsPort {
  permission: () => Promise<PermissionState>;
  requestPermission: () => Promise<PermissionState>;
  /** Local reminder stub (e.g. low-stock nudge). Never throws. */
  scheduleLocal: (
    title: string,
    body: string
  ) => Promise<DeviceResult<{ notificationId: string }>>;
}

export interface DeepLink {
  screen: 'home' | 'settings' | 'devices' | 'sign-in';
  params: Record<string, string>;
}

export interface DeepLinkPort {
  /** Parse an inbound URL; `null` for foreign schemes. Never throws. */
  parse: (url: string) => DeepLink | null;
}
