import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { createContentSecurityPolicy, proxy } from '@/proxy';

describe('web content security policy', () => {
  it('authorizes Next bootstrap scripts with a per-request nonce', () => {
    const first = proxy(new NextRequest('http://localhost/'));
    const second = proxy(new NextRequest('http://localhost/'));
    const firstPolicy = first.headers.get('content-security-policy');
    const secondPolicy = second.headers.get('content-security-policy');

    expect(firstPolicy).toContain("script-src 'self' 'nonce-");
    expect(firstPolicy).toContain("'strict-dynamic' 'unsafe-eval'");
    expect(firstPolicy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(secondPolicy).not.toBe(firstPolicy);
  });

  it('keeps network and embedding boundaries closed', () => {
    const policy = createContentSecurityPolicy('test-nonce');

    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("worker-src 'self' blob:");
  });
});
