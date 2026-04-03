// serve.js — proxy server: API key stays server-side, never sent to browser
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Parse .env
const envPath = path.join(__dirname, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
  });
}

const API_KEY = env.ANTHROPIC_API_KEY || '';
const PORT = 3000;

if (!API_KEY) {
  console.warn('WARNING: No ANTHROPIC_API_KEY found in .env');
}

http.createServer((req, res) => {

  // Serve the HTML (no key injection needed anymore)
  if (req.method === 'GET' && (req.url === '/' || req.url === '/prototype.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'prototype.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  // Proxy endpoint — browser posts here, server adds the key and calls Anthropic
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
        },
      };

      const proxy = https.request(options, apiRes => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      proxy.on('error', e => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message } }));
      });

      proxy.write(body);
      proxy.end();
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');

}).listen(PORT, () => {
  console.log(`Serving at http://localhost:${PORT}`);
  console.log(API_KEY ? 'API key loaded — proxy active' : 'No API key — requests will fail');
});
