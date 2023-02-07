export abstract class VaultTimeoutSettingsService {
  setVaultTimeoutOptions: (vaultTimeout: number, vaultTimeoutAction: string) => Promise<void>;
  getVaultTimeout: (userId?: string) => Promise<number>;
  getVaultTimeoutAction: (userId?: string) => Promise<string>;
  isPinLockSet: () => Promise<[boolean, boolean]>;
  isBiometricLockSet: () => Promise<boolean>;
  clear: (userId?: string) => Promise<void>;
}
