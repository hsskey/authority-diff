const TOKEN_STORAGE_KEY = 'authority.authToken';

export function readAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function writeAuthToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}
