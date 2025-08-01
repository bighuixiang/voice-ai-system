export interface ErrorResponse {
  code: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  retry?: boolean;
  retryAfter?: number;
  details?: any;
}

export interface LoggedError {
  id: string;
  type: string;
  message: string;
  stack?: string;
  context?: any;
  timestamp: Date;
  userId?: string;
  requestId?: string;
}