import {
  fetchPublicSource,
  isPrivateAddress,
  readResponseBodyLimited,
  validatePublicSourceUrl,
} from '../safe-source-fetch';

describe('readResponseBodyLimited', () => {
  it('rejects an oversized declared content length without reading the body', async () => {
    const response = new Response('small', { headers: { 'content-length': '6000000' } });

    await expect(readResponseBodyLimited(response, 5_000_000)).rejects.toThrow(
      'Source exceeds the 5000000-byte limit',
    );
    expect(response.bodyUsed).toBe(false);
  });

  it('stops a chunked response as soon as its actual bytes exceed the limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
    });

    await expect(readResponseBodyLimited(new Response(body), 5)).rejects.toThrow(
      'Source exceeds the 5-byte limit',
    );
  });

  it('returns a complete body within the configured limit', async () => {
    await expect(readResponseBodyLimited(new Response('verified'), 20)).resolves.toEqual(
      Buffer.from('verified'),
    );
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '100.100.100.200',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
  ])('rejects private address %s', (address) => expect(isPrivateAddress(address)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('accepts public address %s', (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );
});

describe('validatePublicSourceUrl', () => {
  it('rejects local hosts and embedded credentials', () => {
    expect(() => validatePublicSourceUrl('http://localhost/report')).toThrow(
      'Private network source rejected',
    );
    expect(() => validatePublicSourceUrl('http://[::1]/report')).toThrow(
      'Private network source rejected',
    );
    expect(() => validatePublicSourceUrl('https://user:secret@example.com/report')).toThrow(
      'Source URL credentials are not allowed',
    );
  });
});

describe('fetchPublicSource', () => {
  it('blocks a public URL that redirects to a private address', async () => {
    const fetcher = jest.fn(async () =>
      Promise.resolve(
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
      ),
    );

    await expect(
      fetchPublicSource('https://example.com/start', {}, 5_000, {
        fetcher,
        resolver: async () => ['93.184.216.34'],
      }),
    ).rejects.toThrow('Private network source rejected');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns the validated final URL after a public redirect', async () => {
    const fetcher = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/article' } }))
      .mockResolvedValueOnce(new Response('verified', { status: 200 }));

    const result = await fetchPublicSource('https://example.com/start', {}, 5_000, {
      fetcher,
      resolver: async () => ['93.184.216.34'],
    });

    expect(result.finalUrl.toString()).toBe('https://example.com/article');
    expect(result.redirectCount).toBe(1);
  });
});
