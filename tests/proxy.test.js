const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const proxy = require('../proxy.js');

test('static allowlist blocks secrets, source and traversal', () => {
  const root = proxy.ROOT;
  assert.equal(proxy.isAllowedStaticPath('/index.html'), path.join(root, 'index.html'));
  assert.equal(proxy.isAllowedStaticPath('/evse-geo.js'), path.join(root, 'evse-geo.js'));
  assert.equal(proxy.isAllowedStaticPath('/sources/source-pack.example.json'), path.join(root, 'sources', 'source-pack.example.json'));
  assert.equal(proxy.isAllowedStaticPath('/out_mwess/mwess_sheet1_AC.svg'), path.join(root, 'out_mwess', 'mwess_sheet1_AC.svg'));
  assert.equal(proxy.isAllowedStaticPath('/.git/config'), null);
  assert.equal(proxy.isAllowedStaticPath('/%2e%2e/package.json'), null);
  assert.equal(proxy.isAllowedStaticPath('/proxy.js'), null);
  assert.equal(proxy.isAllowedStaticPath('/package.json'), null);
  assert.equal(proxy.isAllowedStaticPath('/tests/calc.test.js'), null);
  assert.equal(proxy.isAllowedStaticPath('/nssm/nssm-2.24/win64/nssm.exe'), null);
  assert.equal(proxy.isAllowedStaticPath('/README.md'), null);
  assert.equal(proxy.isAllowedStaticPath('/\\..\\package.json'), null);
});

test('http server only serves allowed files and does not emit wildcard CORS', async () => {
  const server = proxy.createServer({ port: 0, host: '127.0.0.1', corsOrigin: '' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  try {
    const index = await fetch(base + '/index.html');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type') || '', /text\/html/);
    assert.equal(index.headers.get('access-control-allow-origin'), null);
    assert.match(await index.text(), /<!DOCTYPE html>/i);

    const source = await fetch(base + '/sources/source-pack.example.json');
    assert.equal(source.status, 200);

    for (const p of ['/.git/config', '/proxy.js', '/package.json', '/tests/calc.test.js', '/nssm/nssm-2.24/win64/nssm.exe']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 403, p);
      assert.doesNotMatch(await r.text(), /gitdir|require\(/, p);
    }

    const head = await fetch(base + '/index.html', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('CORS is opt-in and only echoes configured origins', async () => {
  const server = proxy.createServer({ port: 0, host: '127.0.0.1', corsOrigin: 'https://example.com' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  try {
    const allowed = await fetch(base + '/index.html', { headers: { Origin: 'https://example.com' } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://example.com');
    const denied = await fetch(base + '/index.html', { headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.status, 200);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});