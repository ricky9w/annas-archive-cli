export interface BookResult {
  md5: string;
  title: string;
  author: string | null;
  year: string | null;
  publisher: string | null;
  format: string | null;
  filepath: string | null;
  verified?: boolean;
}

export interface DownloadOption {
  md5: string;
  pathIndex: string;
  domainIndex: string;
}

export interface BookDetails {
  md5: string;
  title: string;
  author: string | null;
  downloadOptions: {
    fast: DownloadOption[];
    slow: DownloadOption[];
  };
}

export interface AppConfig {
  key?: string;
  output?: string;
  format?: string;
}

export interface SearchOptions {
  format?: string;
  limit?: number;
  sort?: string;
  verify?: string;
}
