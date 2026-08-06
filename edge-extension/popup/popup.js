// PCL2 Downloader — Popup UI

const ICONS = {
  queued: '⏳', downloading: '⬇', completed: '✅', failed: '❌', cancelling: '🚫',
};
const LABELS = {
  queued: '排队中', downloading: '下载中', completed: '已完成', failed: '失败', cancelling: '取消中',
};

let timer = null;

const $list = document.getElementById('jobList');
const $url = document.getElementById('urlInput');
const $autoCatch = document.getElementById('autoCatch');
const $showDialog = document.getElementById('showDialog');
const $hostDot = document.getElementById('hostDot');
const $hostStatus = document.getElementById('hostStatus');

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  refresh();
  timer = setInterval(refresh, 800);
});

function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (r) => {
    if (r && r.settings) {
      $autoCatch.checked = r.settings.autoCatch;
      $showDialog.checked = r.settings.showDialog;
    }
  });
}

$autoCatch.addEventListener('change', save);
$showDialog.addEventListener('change', save);
function save() {
  chrome.runtime.sendMessage({
    action: 'updateSettings',
    settings: { autoCatch: $autoCatch.checked, showDialog: $showDialog.checked },
  });
}

$url.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
document.getElementById('btnAdd').addEventListener('click', doAdd);
function doAdd() {
  const u = $url.value.trim();
  if (!u) return;
  if (!u.startsWith('http://') && !u.startsWith('https://')) { alert('仅支持 HTTP/HTTPS'); return; }
  const fn = u.split('/').pop().split('?')[0] || 'download';
  chrome.runtime.sendMessage({ action: 'downloadUrl', url: u, filename: fn }, () => { $url.value = ''; refresh(); });
}

function refresh() {
  chrome.runtime.sendMessage({ action: 'getJobs' }, (r) => {
    if (r && r.jobs) render(r.jobs);
  });
}

function speedText(bps) {
  if (!bps || bps < 1) return '';
  if (bps < 1024) return bps + ' B/s';
  if (bps < 1048576) return (bps / 1024).toFixed(1) + ' KB/s';
  return (bps / 1048576).toFixed(1) + ' MB/s';
}

function sizeText(b) {
  if (!b || b < 1) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function render(jobs) {
  const entries = Object.entries(jobs);
  if (!entries.length) {
    $list.innerHTML = '<div class="empty"><span class="empty-icon">📭</span><p>暂无下载任务<br>浏览网页时点击链接自动接管</p></div>';
    return;
  }

  $list.innerHTML = entries
    .sort((a, b) => (parseInt(b[0].split('_')[1]) || 0) - (parseInt(a[0].split('_')[1]) || 0))
    .map(([id, j]) => {
      const pct = j.total > 0 ? Math.round(j.received / j.total * 100) : 0;
      const spd = speedText(j.speed);
      const barCls = j.status === 'completed' ? 'done' : j.status === 'failed' ? 'error' : '';
      const cancel = j.status === 'queued' || j.status === 'downloading';
      return `
        <div class="job-item">
          <div class="job-icon">${ICONS[j.status] || '📄'}</div>
          <div class="job-info">
            <div class="job-name" title="${esc(j.filename)}">${esc(j.filename)}</div>
            <div class="job-meta">
              <span>${LABELS[j.status] || j.status}</span>
              ${pct > 0 ? `<span class="job-pct">${pct}%</span>` : ''}
              ${spd ? `<span class="job-speed">${spd}</span>` : ''}
              ${j.total > 0 ? `<span>${sizeText(j.received)} / ${sizeText(j.total)}</span>` : ''}
            </div>
            ${j.total > 0 ? `<div class="job-bar"><div class="job-bar-fg ${barCls}" style="width:${pct}%"></div></div>` : ''}
          </div>
          ${cancel ? `<button class="job-cancel" data-id="${id}">✕</button>` : ''}
        </div>`;
    }).join('');

  $list.querySelectorAll('.job-cancel').forEach(b => {
    b.addEventListener('click', (e) => {
      chrome.runtime.sendMessage({ action: 'cancelJob', jobId: e.target.dataset.id }, () => refresh());
    });
  });

  // 连接状态
  const active = entries.some(([,j]) => j.status === 'queued' || j.status === 'downloading');
  $hostDot.className = 'status-dot ' + (active ? 'on' : '');
  $hostStatus.textContent = active ? '已连接' : '待命中';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
