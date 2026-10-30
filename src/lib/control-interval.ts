export const CONTROL_INTERVAL_MS = 8 * 60 * 60 * 1000;
export type ControlAvailability = {
  can_control: boolean;
  last_control_at: string | null;
  available_at: string | null;
  server_now: string;
};

export function controlAvailability(
  lastControlAt: string | null,
  now = new Date(),
): ControlAvailability {
  const availableAt = lastControlAt
    ? new Date(Date.parse(lastControlAt) + CONTROL_INTERVAL_MS).toISOString()
    : null;
  return {
    can_control: !availableAt || Date.parse(availableAt) <= now.getTime(),
    last_control_at: lastControlAt,
    available_at: availableAt,
    server_now: now.toISOString(),
  };
}
