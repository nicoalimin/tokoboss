import { describe, expect, it } from 'vitest';
import { createDeviceStubs } from '../devices/stubs';
import { parseDeepLink } from '../devices/deep-links';

describe('device stubs', () => {
  it('camera denial returns a recoverable state instead of crashing', async () => {
    const devices = createDeviceStubs({ cameraPermission: 'denied' });
    const photo = await devices.camera.capturePhoto();
    expect(photo.ok).toBe(false);
    if (!photo.ok) {
      expect(photo.reason).toBe('permission-denied');
      expect(photo.recovery.length).toBeGreaterThan(0);
    }
    const scan = await devices.barcode.scan();
    expect(scan.ok).toBe(false);
    if (!scan.ok) expect(scan.recovery.length).toBeGreaterThan(0);
  });

  it('camera grant restores capture and scanning', async () => {
    const devices = createDeviceStubs();
    devices.grantCamera();
    await expect(devices.camera.capturePhoto()).resolves.toMatchObject({
      ok: true,
    });
    await expect(devices.barcode.scan()).resolves.toMatchObject({ ok: true });
  });

  it('notification denial returns a recoverable state', async () => {
    const devices = createDeviceStubs();
    devices.denyNotifications();
    const res = await devices.notifications.scheduleLocal(
      'Low stock',
      'Rice is low'
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('permission-denied');
      expect(res.recovery.length).toBeGreaterThan(0);
    }
    devices.grantNotifications();
    await expect(
      devices.notifications.scheduleLocal('Low stock', 'Rice is low')
    ).resolves.toMatchObject({ ok: true });
  });

  it('photo upload validates input without throwing', async () => {
    const devices = createDeviceStubs();
    const empty = await devices.photoUpload.upload('');
    expect(empty.ok).toBe(false);
    await expect(
      devices.photoUpload.upload('stub://photos/capture-001.jpg')
    ).resolves.toMatchObject({ ok: true });
  });
});

describe('deep links', () => {
  it('parses tokoboss:// URLs and rejects foreign schemes', () => {
    expect(parseDeepLink('tokoboss://devices')).toMatchObject({
      screen: 'devices',
    });
    expect(parseDeepLink('tokoboss://sign-in?next=%2Fdevices')).toMatchObject({
      screen: 'sign-in',
      params: { next: '/devices' },
    });
    expect(parseDeepLink('tokoboss://')).toMatchObject({ screen: 'home' });
    expect(parseDeepLink('https://tokoboss.app/devices')).toBeNull();
    expect(parseDeepLink('tokoboss://unknown-screen')).toBeNull();
    expect(parseDeepLink('not a url')).toBeNull();
  });
});
