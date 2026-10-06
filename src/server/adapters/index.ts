import { caktoAdapter } from "./cakto";
import { genericAdapter } from "./generic";
import type { PaymentProviderAdapter } from "./types";

const ADAPTERS = { cakto: caktoAdapter, custom: genericAdapter } as const;

export type ProviderKey = keyof typeof ADAPTERS;

export function isProviderKey(value: string): value is ProviderKey {
  return value in ADAPTERS;
}

export function getAdapter(provider: ProviderKey): PaymentProviderAdapter {
  return ADAPTERS[provider];
}
