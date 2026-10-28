export type InputDeviceLike = Pick<MediaDeviceInfo, "deviceId">;

export function isStoredDeviceMissing(storedDeviceId: string | null, devices: readonly InputDeviceLike[]): boolean {
  if (storedDeviceId === null) return false;
  const knownIds = devices.map((device) => device.deviceId).filter((id) => id !== "");
  if (knownIds.length === 0) return false;
  return !knownIds.includes(storedDeviceId);
}
