import { ApiError } from "./errors";
import type { PorchaiApi } from "./types";

export const CONSENT_STORAGE_KEY = "porchai.consent.v1";

type ConsentState = { accepted: boolean; version: string | null };

function read(): ConsentState {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return { accepted: false, version: null };
    const parsed = JSON.parse(raw) as { version?: unknown; acceptedAt?: unknown };
    if (typeof parsed.version !== "string" || typeof parsed.acceptedAt !== "string") {
      return { accepted: false, version: null };
    }
    return { accepted: true, version: parsed.version };
  } catch {
    return { accepted: false, version: null }; // unreadable storage = not consented
  }
}

function write(version: string): void {
  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version, acceptedAt: new Date().toISOString() }),
    );
  } catch {
    // storage blocked: the user will be asked again next time
  }
}

export function clearConsentFlag(): void {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

const isNotImplemented = (err: unknown) => err instanceof ApiError && err.code === "not_implemented";

// TODO(backend): drop this once the server has a consent API; live consent() then works as is.
export function withConsentFallback(api: PorchaiApi): PorchaiApi {
  return {
    ...api,
    async consent() {
      try {
        return await api.consent();
      } catch (err) {
        if (isNotImplemented(err)) return read();
        throw err;
      }
    },
    async acceptConsent(version) {
      try {
        await api.acceptConsent(version);
      } catch (err) {
        if (!isNotImplemented(err)) throw err;
        write(version);
      }
    },
  };
}
