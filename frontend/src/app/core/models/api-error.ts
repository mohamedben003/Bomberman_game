/** Shapes of the REST error body (PROTOCOL.md §1.1). */
export interface ApiError {
  code: string;
  message: string;
  timestamp: string;
  path: string;
}
