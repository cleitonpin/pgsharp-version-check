export interface ApkVersionDetails {
  versionName: string | null;
  versionCode: string | null;
}

export interface VersionInfo {
  scrapedVersion: string | null;
  manifestVersionName: string | null;
  manifestVersionCode: string | null;
  filename: string | null;
  downloadedAt?: string;
  updatedAt?: string;
  filePath?: string;
}

export interface DownloadedApkData {
  filePath: string;
  determinedFilename: string;
}