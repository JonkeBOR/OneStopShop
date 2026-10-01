import 'server-only';

export type CookieAttributes = {
  readonly maxAgeSeconds: number;
  readonly sameSite?: 'Lax' | 'Strict' | 'None';
  readonly path?: string;
};

export function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
  return [
    `${name}=${value}`,
    'HttpOnly',
    'Secure',
    `SameSite=${attributes.sameSite ?? 'Lax'}`,
    `Path=${attributes.path ?? '/'}`,
    `Max-Age=${attributes.maxAgeSeconds}`,
  ].join('; ');
}

export function parseCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const partName = part.slice(0, separatorIndex).trim();
    if (partName === name) {
      return part.slice(separatorIndex + 1).trim();
    }
  }
  return undefined;
}
