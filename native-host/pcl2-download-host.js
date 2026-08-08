// ============================================================
// PCL2 Edge Integration — Native Messaging Host (v2 简化版)
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const os = require('os');

const LOG_FILE = path.join(os.homedir(), 'Downloads', 'pcl2-host.log');
function log(level, ...args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}`;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch(e) {}
}

// ============================================================
// 简单的 HTTP GET 下载（可靠的单线程，类似 PCL2 基础模式）
// ============================================================
function simpleDownload(url, savePath, cookies, referer, onProgress, timeout) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    let received = 0;
    let total = 0;
    let startTime = Date.now();

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/131.0.0.0',
    };
    if (cookies) headers['Cookie'] = cookies;
    if (referer)  headers['Referer'] = referer;

    const req = mod.get(url, {
      timeout: timeout || 60000,
      headers,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return simpleDownload(new URL(res.headers.location, url).href, savePath, cookies, referer, onProgress, timeout).then(resolve).catch(reject);
      }

      total = parseInt(res.headers['content-length'] || '0', 10);
      const file = fs.createWriteStream(savePath);
      let lastEmit = 0;

      res.on('data', (chunk) => {
        received += chunk.length;
        file.write(chunk);
        // 每 200ms 发一次进度，避免高频消息
        const now = Date.now();
        if (now - lastEmit > 200) {
          lastEmit = now;
          const elapsed = (now - startTime) / 1000;
          const speed = elapsed > 0 ? Math.round(received / elapsed) : 0;
          const remaining = total > 0 ? total - received : 0;
          const eta = speed > 0 ? Math.round(remaining / speed) : 0;
          if (onProgress) onProgress({ received, total, speed, eta, percent: total > 0 ? Math.round(received * 100 / total) : 0 });
        }
      });

      res.on('end', () => {
        file.end(() => {
          const elapsed = (Date.now() - startTime) / 1000;
          log('INFO', `Download complete: ${savePath} (${received} bytes, ${elapsed.toFixed(1)}s)`);
          const { execFile } = require('child_process');
          execFile('explorer', ['/select,', savePath], () => {});
          resolve(received);
        });
      });

      res.on('error', (e) => { file.close(); reject(e); });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

// ============================================================
// Native Messaging 协议
// ============================================================
function sendMessage(obj) {
  const json = JSON.stringify(obj);
  const buf = Buffer.alloc(4 + Buffer.byteLength(json, 'utf8'));
  buf.writeUInt32LE(Buffer.byteLength(json, 'utf8'), 0);
  buf.write(json, 4, Buffer.byteLength(json, 'utf8'), 'utf8');
  process.stdout.write(buf);
}

function sendProgress(jobId, received, total, percent, status, speed, eta) {
  sendMessage({ type: 'progress', jobId, received, total, percent, status, speed: speed || 0, eta: eta || 0 });
}

function readMessage() {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const msgLen = buf.readUInt32LE(0);
        if (buf.length < 4 + msgLen) return;
        const msgJson = buf.slice(4, 4 + msgLen).toString('utf8');
        buf = buf.slice(4 + msgLen);
        try { resolve(JSON.parse(msgJson)); return; } catch (e) { reject(e); return; }
      }
    };
    stdin.on('data', onData);
    stdin.on('end', () => reject(new Error('stdin closed')));
    stdin.on('error', reject);
  });
}

// ============================================================
// 消息处理
// ============================================================
async function handleMessage(msg) {
  log('INFO', 'RECV:', JSON.stringify(msg));

  switch (msg.action) {
    case 'download': {
      const downloadDir = 'D:\\下载';
      let filename = msg.filename || 'download';
      if (filename === 'unknown' || !filename) {
        try { filename = new URL(msg.url).pathname.split('/').pop() || 'download'; } catch(e) {}
      }
      let finalPath = path.join(downloadDir, filename);
      let counter = 1;
      while (fs.existsSync(finalPath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        finalPath = path.join(downloadDir, `${base} (${counter})${ext}`);
        counter++;
      }

      log('INFO', `Download start: ${msg.url} → ${finalPath}`);
      sendMessage({ type: 'response', jobId: msg.jobId, status: 'started', savePath: finalPath });

      // 异步下载
      try {
        await simpleDownload(msg.url, finalPath, msg.cookies || '', msg.referer || '', ({ received, total, percent, speed, eta }) => {
          sendProgress(msg.jobId, received, total, percent, 'downloading', speed, eta);
        }, 30000);
        sendProgress(msg.jobId, 0, 0, 100, 'completed');
      } catch (e) {
        log('ERROR', `Download failed: ${e.message}`);
        sendMessage({ type: 'error', jobId: msg.jobId, error: e.message });
      }
      break;
    }

    case 'cancel':
      sendMessage({ type: 'response', jobId: msg.jobId, status: 'cancelled' });
      break;

    case 'ping':
      sendMessage({ type: 'response', pong: true, version: '2.0.0' });
      break;

    default:
      sendMessage({ type: 'error', error: `Unknown action: ${msg.action}` });
  }
}

// ============================================================
// 主循环
// ============================================================
async function main() {
  sendMessage({ type: 'ready' });
  while (true) {
    try {
      const msg = await readMessage();
      await handleMessage(msg);
    } catch (e) {
      process.exit(0);
    }
  }
}

main().catch(() => process.exit(1));
