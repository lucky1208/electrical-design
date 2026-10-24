/* ============================================================
 * 本地开发反代服务器 — 解决浏览器 CORS 问题
 * ------------------------------------------------------------
 * 用法：node proxy.js
 * 默认端口：5173
 *
 * 网页端配置：
 *   API 地址: http://localhost:5173/bailian/openai/v1
 *   API Key:  你的 sk_...
 *   模型名:   bailian/qwen3.8-max
 * ============================================================ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 5173;
const UPSTREAM = 'codingxrui.geely-test.com';
const UPSTREAM_PATH_PREFIX = '/bailian/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS 头（方便前端 fetch）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  // --- 反代 /bailian/ → 百炼 ---
  if (pathname.startsWith(UPSTREAM_PATH_PREFIX)) {
    const upstreamPath = pathname; // 路径原样转发
    const upstreamHeaders = {};

    // 透传关键头
    if (req.headers['content-type'])  upstreamHeaders['content-type'] = req.headers['content-type'];
    if (req.headers['authorization']) upstreamHeaders['authorization'] = req.headers['authorization'];
    upstreamHeaders['host'] = UPSTREAM;
    upstreamHeaders['accept'] = req.headers['accept'] || 'application/json';
    upstreamHeaders['accept-encoding'] = 'identity'; // 不压缩，省事

    const proxyReq = https.request({
      hostname: UPSTREAM,
      port: 443,
      path: upstreamPath,
      method: req.method,
      headers: upstreamHeaders,
      servername: UPSTREAM
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      console.error('[proxy error]', e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway', detail: e.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // --- 静态文件 ---
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  // 防目录穿越
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ============================================');
  console.log('  🚀 EVSE 原理图平台 + 百炼反代已启动');
  console.log('  ============================================');
  console.log('');
  console.log('  平台地址:  http://localhost:' + PORT + '/index.html');
  console.log('  反代路径:  http://localhost:' + PORT + '/bailian/openai/v1');
  console.log('  上游接口:  https://' + UPSTREAM + '/bailian/openai/v1');
  console.log('');
  console.log('  网页端大模型设置里填：');
  console.log('    API 地址: http://localhost:' + PORT + '/bailian/openai/v1');
  console.log('    API Key:  你的 sk-...');
  console.log('    模型名:   bailian/qwen3.8-max');
  console.log('');
  console.log('  按 Ctrl+C 停止');
  console.log('');
});
