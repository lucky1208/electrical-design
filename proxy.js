/* ============================================================
 * 本地开发反代服务器 — 解决浏览器 CORS 问题
 * ------------------------------------------------------------
 * 用法：node proxy.js
 * 默认只监听 127.0.0.1:5173。
 *
 * 可选环境变量：
 *   EVSE_HOST       监听地址（默认 127.0.0.1）
 *   EVSE_PORT       监听端口（默认 5173）
 *   EVSE_UPSTREAM   上游主机名（默认 codingxrui.geely-test.com）
 *   EVSE_CORS_ORIGIN 允许的跨域来源（默认关闭；多个用逗号分隔）
 * ============================================================ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm'
};

const ALLOWED_EXT = new Set(Object.keys(MIME));
const DENY_SEGMENTS = new Set(['.git', '.github', '.openai', 'node_modules', 'tests', 'scripts', 'nssm']);
const DENY_FILES = new Set(['proxy.js', 'package.json', 'package-lock.json', 'start-proxy.bat', 'start-proxy-silent.vbs', '_search.py', '_search2.py', 'nssm.zip']);

function loadConfig(overrides) {
  const cfg = Object.assign({
    host: process.env.EVSE_HOST || '127.0.0.1',
    port: Number(process.env.EVSE_PORT) || 5173,
    upstream: process.env.EVSE_UPSTREAM || 'codingxrui.geely-test.com',
    upstreamPrefix: '/bailian/',
    corsOrigin: process.env.EVSE_CORS_ORIGIN || ''
  }, overrides || {});
  cfg.port = Number(cfg.port) || 5173;
  if (!cfg.upstreamPrefix.startsWith('/')) cfg.upstreamPrefix = '/' + cfg.upstreamPrefix;
  if (!cfg.upstreamPrefix.endsWith('/')) cfg.upstreamPrefix += '/';
  return cfg;
}

function isAllowedStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(String(pathname || '')); } catch (e) { return null; }
  if (decoded.indexOf('\0') >= 0) return null;
  decoded = decoded.replace(/\\/g, '/');
  const rel = decoded.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, rel || 'index.html');
  const relCheck = path.relative(ROOT, filePath);
  if (!relCheck || relCheck === '..' || relCheck.startsWith('..' + path.sep) || path.isAbsolute(relCheck)) return null;
  const segs = relCheck.split(path.sep);
  if (segs.some(function (s) { return !s || s.startsWith('.') || DENY_SEGMENTS.has(s); })) return null;
  if (DENY_FILES.has(segs[segs.length - 1])) return null;
  if (!ALLOWED_EXT.has(path.extname(filePath).toLowerCase())) return null;
  return filePath;
}

function allowedCorsOrigin(req, cfg) {
  const origin = req.headers.origin;
  if (!cfg.corsOrigin || !origin) return '';
  if (cfg.corsOrigin === '*') return '*';
  return cfg.corsOrigin.split(',').map(function (s) { return s.trim(); }).filter(Boolean).indexOf(origin) >= 0 ? origin : '';
}

function setCommonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
}

function createServer(overrides) {
  const cfg = loadConfig(overrides);
  return http.createServer(function (req, res) {
    setCommonHeaders(res);
    const origin = allowedCorsOrigin(req, cfg);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname || '/'; }
    catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (pathname.startsWith(cfg.upstreamPrefix)) {
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }
      const upstreamHeaders = {};
      if (req.headers['content-type']) upstreamHeaders['content-type'] = req.headers['content-type'];
      if (req.headers['authorization']) upstreamHeaders['authorization'] = req.headers['authorization'];
      upstreamHeaders.host = cfg.upstream;
      upstreamHeaders.accept = req.headers.accept || 'application/json';
      upstreamHeaders['accept-encoding'] = 'identity';

      const proxyReq = https.request({
        hostname: cfg.upstream,
        port: 443,
        path: pathname,
        method: req.method,
        headers: upstreamHeaders,
        servername: cfg.upstream
      }, function (proxyRes) {
        const headers = { 'Content-Type': proxyRes.headers['content-type'] || 'application/json' };
        if (origin) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers.Vary = 'Origin';
        }
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', function (e) {
        console.error('[proxy error]', e.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway', detail: e.message }));
      });
      req.pipe(proxyReq);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    const filePath = isAllowedStaticPath(pathname);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, function (err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      if (req.method === 'HEAD') res.end();
      else res.end(data);
    });
  });
}

function start(overrides) {
  const cfg = loadConfig(overrides);
  const server = createServer(cfg);
  server.listen(cfg.port, cfg.host, function () {
    console.log('');
    console.log('  ============================================');
    console.log('  EVSE 原理图平台 + 百炼反代已启动');
    console.log('  ============================================');
    console.log('');
    console.log('  监听地址:  http://' + cfg.host + ':' + cfg.port + '/index.html');
    console.log('  反代路径:  http://' + cfg.host + ':' + cfg.port + cfg.upstreamPrefix + 'openai/v1');
    console.log('  上游接口:  https://' + cfg.upstream + cfg.upstreamPrefix + 'openai/v1');
    console.log('  CORS:      ' + (cfg.corsOrigin || '关闭（同源页面不需要）'));
    console.log('');
    console.log('  按 Ctrl+C 停止');
    console.log('');
  });
  return server;
}

if (require.main === module) start();

module.exports = { ROOT, MIME, loadConfig, isAllowedStaticPath, createServer, start };