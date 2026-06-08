import type { UUID } from "../types/domain";

export function uuid(): UUID {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
