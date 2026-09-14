/**
 * Testable device stubs (UTA-13).
 *
 * Deterministic, permission-aware fakes used by unit tests, the Devices
 * demo screen, and Expo Go previews. Flip permissions with the helpers to
 * demo the denial → recoverable-state path without touching native APIs.
 */

import type {
  BarcodePort,
  CameraPort,
  DeviceResult,
  NotificationsPort,
  PermissionState,
  PhotoUploadPort,
} from './ports';

export interface StubDeviceState {
  cameraPermission: PermissionState;
  notificationPermission: PermissionState;
}

export interface DeviceStubs {
  state: StubDeviceState;
  grantCamera: () => void;
  denyCamera: () => void;
  grantNotifications: () => void;
  denyNotifications: () => void;
  camera: CameraPort;
  barcode: BarcodePort;
  photoUpload: PhotoUploadPort;
  notifications: NotificationsPort;
}

const CAMERA_DENIED_RECOVERY =
  'Camera access is off. Enable it in Settings to take product photos — you can continue browsing meanwhile.';
const NOTIFICATION_DENIED_RECOVERY =
  'Notifications are off. Enable them in Settings to get low-stock reminders — nothing urgent is missed in-app.';

function denied<T>(
  reason: 'permission-denied',
  recovery: string
): DeviceResult<T> {
  return { ok: false, reason, recovery };
}

export function createDeviceStubs(
  initial: Partial<StubDeviceState> = {}
): DeviceStubs {
  const state: StubDeviceState = {
    cameraPermission: initial.cameraPermission ?? 'undetermined',
    notificationPermission: initial.notificationPermission ?? 'undetermined',
  };

  const camera: CameraPort = {
    permission: async () => state.cameraPermission,
    requestPermission: async () => state.cameraPermission,
    capturePhoto: async () => {
      if (state.cameraPermission !== 'granted') {
        return denied('permission-denied', CAMERA_DENIED_RECOVERY);
      }
      return { ok: true, value: { uri: 'stub://photos/capture-001.jpg' } };
    },
  };

  const barcode: BarcodePort = {
    scan: async () => {
      // The scanner viewfinder needs the camera.
      if (state.cameraPermission !== 'granted') {
        return denied('permission-denied', CAMERA_DENIED_RECOVERY);
      }
      return { ok: true, value: { value: '8991234567890', format: 'ean13' } };
    },
  };

  const photoUpload: PhotoUploadPort = {
    upload: async (localUri: string) => {
      if (!localUri) {
        return {
          ok: false,
          reason: 'cancelled',
          recovery: 'No photo was selected. Pick a photo to retry the upload.',
        };
      }
      return { ok: true, value: { remoteId: 'file_stub_001' } };
    },
  };

  const notifications: NotificationsPort = {
    permission: async () => state.notificationPermission,
    requestPermission: async () => state.notificationPermission,
    scheduleLocal: async (_title: string, _body: string) => {
      if (state.notificationPermission !== 'granted') {
        return denied('permission-denied', NOTIFICATION_DENIED_RECOVERY);
      }
      return { ok: true, value: { notificationId: 'notif_stub_001' } };
    },
  };

  return {
    state,
    grantCamera: () => {
      state.cameraPermission = 'granted';
    },
    denyCamera: () => {
      state.cameraPermission = 'denied';
    },
    grantNotifications: () => {
      state.notificationPermission = 'granted';
    },
    denyNotifications: () => {
      state.notificationPermission = 'denied';
    },
    camera,
    barcode,
    photoUpload,
    notifications,
  };
}
