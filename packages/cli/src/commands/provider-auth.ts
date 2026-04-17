import { existsSync, readFileSync } from "node:fs";
import type {
  AuthStorage,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";

export type LoginCallbacks = Parameters<AuthStorage["login"]>[1];

export interface DashboardAuthStorage {
  reload(): void;
  getOAuthProviders(): Array<{ id: string; name: string }>;
  hasAuth(provider: string): boolean;
  login(providerId: string, callbacks: LoginCallbacks): Promise<void>;
  logout(provider: string): void;
  getApiKeyProviders(): Array<{ id: string; name: string }>;
  setApiKey(providerId: string, apiKey: string): void;
  clearApiKey(providerId: string): void;
  hasApiKey(providerId: string): boolean;
  getApiKey(providerId: string): Promise<string | undefined>;
  get(providerId: string): { type?: string; key?: string } | undefined;
}

interface ReadFallbackAuthStorage {
  reload(): void;
  hasAuth(provider: string): boolean;
  getApiKey(providerId: string): Promise<string | undefined>;
  get(providerId: string): { type?: string; key?: string } | undefined;
}

const BUILT_IN_API_KEY_PROVIDERS: Array<{ id: string; name: string }> = [
  { id: "kimi-coding", name: "Kimi" },
  { id: "minimax", name: "Minimax" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "zai", name: "Zai" },
];

function getProviderDisplayName(providerId: string): string {
  const knownProviderNames = new Map(
    BUILT_IN_API_KEY_PROVIDERS.map((provider) => [provider.id, provider.name]),
  );

  const knownName = knownProviderNames.get(providerId);
  if (knownName) return knownName;

  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function wrapAuthStorageWithApiKeyProviders(
  authStorage: AuthStorage,
  modelRegistry: ModelRegistry,
  readFallbackAuthStorages: ReadFallbackAuthStorage[] = [],
): DashboardAuthStorage {
  const readAuthStorages = [authStorage, ...readFallbackAuthStorages];
  const getCredential = (providerId: string) => {
    for (const storage of readAuthStorages) {
      const credential = storage.get(providerId);
      if (credential) return credential;
    }
    return undefined;
  };

  return {
    reload: () => {
      for (const storage of readAuthStorages) {
        storage.reload();
      }
    },
    getOAuthProviders: () =>
      authStorage
        .getOAuthProviders()
        .map((provider) => ({ id: provider.id, name: provider.name })),
    hasAuth: (provider) => readAuthStorages.some((storage) => storage.hasAuth(provider)),
    login: (providerId, callbacks) =>
      authStorage.login(providerId as Parameters<AuthStorage["login"]>[0], callbacks),
    logout: (provider) => authStorage.logout(provider),
    getApiKeyProviders: () => {
      const oauthProviderIds = new Set(
        authStorage.getOAuthProviders().map((provider) => provider.id),
      );
      const providers = new Map<string, string>();

      for (const provider of BUILT_IN_API_KEY_PROVIDERS) {
        if (!oauthProviderIds.has(provider.id)) {
          providers.set(provider.id, provider.name);
        }
      }

      for (const model of modelRegistry.getAll()) {
        const providerId = model.provider;
        if (!providerId || oauthProviderIds.has(providerId) || providers.has(providerId)) {
          continue;
        }
        providers.set(providerId, getProviderDisplayName(providerId));
      }

      return Array.from(providers, ([id, name]) => ({ id, name })).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
    setApiKey: (providerId, apiKey) => {
      authStorage.set(providerId, { type: "api_key", key: apiKey });
    },
    clearApiKey: (providerId) => {
      authStorage.remove(providerId);
    },
    hasApiKey: (providerId) => {
      const credential = getCredential(providerId);
      return credential?.type === "api_key" && !!credential.key;
    },
    getApiKey: async (providerId) => {
      for (const storage of readAuthStorages) {
        const apiKey = await storage.getApiKey(providerId);
        if (apiKey) return apiKey;
      }
      return undefined;
    },
    get: getCredential,
  };
}

export function createReadOnlyAuthFileStorage(authPaths: string[]): ReadFallbackAuthStorage {
  let credentials: Record<string, { type?: string; key?: string }> = {};

  const reload = () => {
    const nextCredentials: Record<string, { type?: string; key?: string }> = {};
    for (const authPath of authPaths) {
      if (!existsSync(authPath)) {
        continue;
      }
      try {
        const parsed = JSON.parse(readFileSync(authPath, "utf-8")) as Record<string, { type?: string; key?: string }>;
        for (const [provider, credential] of Object.entries(parsed)) {
          nextCredentials[provider] ??= credential;
        }
      } catch {
        // Ignore unreadable legacy auth files and continue with other candidates.
      }
    }
    credentials = nextCredentials;
  };

  reload();

  return {
    reload,
    hasAuth: (provider) => Boolean(credentials[provider]),
    get: (provider) => credentials[provider],
    getApiKey: async (provider) => {
      const credential = credentials[provider];
      return credential?.type === "api_key" ? credential.key : undefined;
    },
  };
}
