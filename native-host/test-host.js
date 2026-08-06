// ============================================================
// Native Messaging Host 测试工具 v2
// 用法: node test-host.js
// ============================================================

const { spawn } = require('child_process');
const path = require('path');

async function test() {
  console.log('=== PCL2 Native Messaging Host 测试 ===\n');

  const proc = spawn('node', [path.join(__dirname, 'pcl2-download-host.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // 连续消息读取器
  const messages = [];
  let buf = Buffer.alloc(0);
  proc.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const msgLen = buf.readUInt32LE(0);
      if (buf.length < 4 + msgLen) break;
      const msgJson = buf.slice(4, 4 + msgLen).toString('utf8');
      buf = buf.slice(4 + msgLen);
      try { messages.push(JSON.parse(msgJson)); } catch(e) {}
    }
  });

  proc.stderr.on('data', (d) => console.error('  [stderr]', d.toString()));

  function waitMsg(timeout = 5000) {
    return new Promise((resolve) => {
      const check = () => {
        if (messages.length > 0) resolve(messages.shift());
        else if (Date.now() - start > timeout) resolve(null);
        else setTimeout(check, 50);
      };
      const start = Date.now();
      check();
    });
  }

  let rid = 0;
  function send(msg) {
    msg._rid = ++rid;
    const json = JSON.stringify(msg);
    const b = Buffer.alloc(4 + Buffer.byteLength(json, 'utf8'));
    b.writeUInt32LE(Buffer.byteLength(json, 'utf8'), 0);
    b.write(json, 4, Buffer.byteLength(json, 'utf8'), 'utf8');
    proc.stdin.write(b);
  }

  // Ready
  const ready = await waitMsg();
  console.log('1. Ready:', JSON.stringify(ready));

  // Ping
  send({ action: 'ping' });
  const pong = await waitMsg();
  console.log('2. Ping:', JSON.stringify(pong));

  // 测试下载
  console.log('\n3. 测试下载 https://httpbin.org/bytes/1024 ...');
  send({
    action: 'download',
    jobId: 'test_' + Date.now(),
    url: 'https://httpbin.org/bytes/1024',
    filename: 'test-1024.bin',
    threadCount: 2,
  });

  const started = await waitMsg();
  console.log('   启动响应:', JSON.stringify(started));

  // 等待进度
  for (let i = 0; i < 10; i++) {
    const p = await waitMsg(8000);
    if (!p) break;
    if (p.type === 'progress') {
      console.log(`   进度: ${p.percent}% (${p.received}/${p.total}) — ${p.status}`);
    } else if (p.type === 'error') {
      console.log('   错误:', p.error);
      break;
    } else if (p.type === 'response') {
      console.log('   响应:', JSON.stringify(p));
    }
    if (p.status === 'completed' || p.status === 'failed') break;
  }

  console.log('\n=== 测试完成 ===');
  proc.kill();
}

test().catch(console.error);
