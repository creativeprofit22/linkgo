export interface AppSettingsRow {
  id: 1;
  launch_on_login_enabled: number;
  launch_on_login_last_synced_at: string | null;
  launch_on_login_last_error: string;
  created_at: string;
  updated_at: string;
}

export interface LaunchOnLoginSettings {
  enabled: boolean;
  osEnabled: boolean;
  lastSyncedAt: string | null;
  lastError: string;
}

export interface SetLaunchOnLoginInput {
  enabled: boolean;
}
