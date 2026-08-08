// ============================================================
// PCL2 Downloader — Edge Extension Background Service Worker
// 使用回调模式 (避免 MV3 Service Worker 提前终止丢失 Promise)
// ============================================================

const NATIVE_HOST_NAME = 'com.pcl2.downloader';

// 安全文件名：去除 Windows 非法字符
function safeFilename(name) {
  if (!name || name === 'unknown') return 'download';
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/[\x00-\x1f]/g, '').trim() || 'download';
}

let activeJobs = {};
let fallbackAllowlist = new Set();
const FALLBACK_TTL = 60000;
let settings = { autoCatch: true, showDialog: true, threadCount: 4 };
let nativePort = null;

// ============================================================
// 初始化 — 立即连接 Native Host
// ============================================================
console.log('[PCL2] Service Worker started');

function connectNativeHost() {
try {
  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  if (chrome.runtime.lastError) {
    console.error('[PCL2] connectNative FAILED:', chrome.runtime.lastError.message);
    nativePort = null;
    return;
  }
    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(() => {
      console.warn('[PCL2] Native Host disconnected — auto-reconnect in 3s');
      nativePort = null;
      for (const [id, job] of Object.entries(activeJobs)) {
        if (job.status === 'queued' || job.status === 'downloading') job.status = 'failed';
      }
      updateBadge();
      setTimeout(connectNativeHost, 3000);
    });
    console.log('[PCL2] Native Host CONNECTED');
} catch (e) {
  console.error('[PCL2] connectNative EXCEPTION:', e.message);
  nativePort = null;
}
}
connectNativeHost();

// ============================================================
// 处理 Native Host 消息
// ============================================================
function handleHostMessage(msg) {
  console.log('[PCL2] ← Host:', msg.type, msg.jobId || '');

  if (msg.type === 'ready') return;

  const job = activeJobs[msg.jobId];
  if (!job && msg.jobId) return;

  if (msg.type === 'response' && msg.status === 'started') {
    console.log('[PCL2] Download ACCEPTED:', msg.savePath);
    if (job) { job.status = 'downloading'; job.savePath = msg.savePath; }
  }

  if (msg.type === 'progress') {
    if (job) {
      job.status = msg.status;
      job.received = msg.received;
      job.total = msg.total;
      job.speed = msg.speed || 0;
      updateBadge();
    }
    if (msg.status === 'completed' && job) {
      console.log('[PCL2] Download COMPLETED:', job.filename);
      chrome.notifications.create('done_' + msg.jobId, {
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: '下载完成', message: job.filename,
      });
    }
  }

  if (msg.type === 'error') {
    console.error('[PCL2] Host error:', msg.error);
    if (job) { job.status = 'failed'; updateBadge(); }
    // Fallback to browser
    if (job) {
      fallbackAllowlist.add(job.url);
      setTimeout(() => fallbackAllowlist.delete(job.url), FALLBACK_TTL);
      chrome.downloads.download({ url: job.url, filename: job.filename });
    }
  }
}

// ============================================================
// 核心拦截：onCreated
// ============================================================
chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!settings.autoCatch) return;

  const url = downloadItem.url;
  const filename = safeFilename(downloadItem.filename);

  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  if (fallbackAllowlist.has(url)) { fallbackAllowlist.delete(url); return; }

  const jobId = 'pcl2_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  activeJobs[jobId] = { url, filename, status: 'queued', received: 0, total: downloadItem.fileSize || 0 };

  console.log('[PCL2] Intercepted:', filename, '→ jobId:', jobId);

  // 延迟取消浏览器下载
  setTimeout(() => {
    chrome.downloads.cancel(downloadItem.id, () => {
      if (!chrome.runtime.lastError) {
        chrome.downloads.erase({ id: downloadItem.id });
        console.log('[PCL2] Browser download cancelled');
      }
    });
  }, 200);

  // 直接发送到 Native Host（不用 Promise）
  if (!nativePort) {
    console.error('[PCL2] No Native Host connection');
    activeJobs[jobId].status = 'failed';
    fallbackAllowlist.add(url);
    setTimeout(() => fallbackAllowlist.delete(url), FALLBACK_TTL);
    chrome.downloads.download({ url, filename });
    return;
  }

  try {
    nativePort.postMessage({ 
      action: 'download', jobId, url, filename, 
      threadCount: settings.threadCount,
      cookies: downloadItem.cookies || '',
      referer: downloadItem.referrer || '',
    });
    console.log('[PCL2] → Host: download', jobId);
  } catch (e) {
    console.error('[PCL2] postMessage failed:', e.message);
    activeJobs[jobId].status = 'failed';
  }

  updateBadge();

  if (settings.showDialog) {
    chrome.notifications.create('pcl2_' + jobId, {
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: 'PCL2 已接管下载', message: filename,
      priority: 1, buttons: [{ title: '查看进度' }],
    });
  }
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => { suggest(); });

// ============================================================
// Popup 通信
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'getJobs': sendResponse({ jobs: activeJobs }); break;
    case 'cancelJob':
      if (activeJobs[msg.jobId]) activeJobs[msg.jobId].status = 'cancelling';
      if (nativePort) { try { nativePort.postMessage({ action: 'cancel', jobId: msg.jobId }); } catch(e) {} }
      sendResponse({ ok: true }); break;
    case 'updateSettings':
      Object.assign(settings, msg.settings);
      chrome.storage.local.set(settings);
      sendResponse({ ok: true }); break;
    case 'getSettings': sendResponse({ settings }); break;
    case 'downloadUrl': {
      const jid = 'pcl2_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const fn = msg.filename || 'download';
      activeJobs[jid] = { url: msg.url, filename: fn, status: 'queued', received: 0, total: 0 };
      if (nativePort) nativePort.postMessage({ action: 'download', jobId: jid, url: msg.url, filename: fn, threadCount: settings.threadCount });
      sendResponse({ jobId: jid }); break;
    }
  }
  return true;
});

chrome.notifications.onButtonClicked.addListener((nid, btnIdx) => {
  if (btnIdx === 0) chrome.action.openPopup();
});

function updateBadge() {
  const count = Object.values(activeJobs).filter(j => j.status === 'queued' || j.status === 'downloading').length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  if (count > 0) chrome.action.setBadgeBackgroundColor({ color: '#0078D4' });
}

setInterval(() => {
  const cutoff = Date.now() - 600000;
  for (const [id, job] of Object.entries(activeJobs)) {
    const ts = parseInt(id.split('_')[1]);
    if (ts && ts < cutoff && (job.status === 'completed' || job.status === 'failed')) delete activeJobs[id];
  }
  updateBadge();
}, 30000);
