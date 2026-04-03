export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NetworkError extends AppError {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message, "NETWORK_ERROR");
    this.name = "NetworkError";
  }
}

export class DownloadError extends AppError {
  constructor(
    message: string,
    public readonly retryable = true,
  ) {
    super(message, "DOWNLOAD_ERROR");
    this.name = "DownloadError";
  }
}

export class StallError extends DownloadError {
  constructor(stallSeconds: number) {
    super(`Download stalled: no data received for ${stallSeconds}s`, true);
    this.name = "StallError";
  }
}
