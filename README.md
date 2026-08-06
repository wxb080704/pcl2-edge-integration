# ⬇️ PCL2 Edge Integration

> 把 PCL2 的高速多线程下载引擎接入 Edge 浏览器 — 自动拦截下载、分片加速、断点续传。

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-blue?logo=windows" alt="Windows">
  <img src="https://img.shields.io/badge/Edge-v88+-teal?logo=microsoftedge" alt="Edge">
  <img src="https://img.shields.io/badge/Node.js-v16+-green?logo=nodedotjs" alt="Node.js">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
</p>

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 🔽 **自动拦截** | 浏览器下载自动被接管，无需手动操作 |
| ⚡ **高速下载** | 原生 TCP 流式下载，速度等同浏览器 |
| 📊 **实时速度** | 工具栏弹窗实时显示 MB/s |
| 📁 **自定义目录** | 下载保存到指定文件夹（默认 `D:\下载`） |
| 🔄 **自动重连** | Native Host 断开后 3 秒自动恢复 |
| 🎨 **暗色界面** | 现代化深色 UI，下载进度一目了然 |

## 🏗 架构

```
Edge 浏览器                 本地桥接                  下载引擎
┌──────────────┐  Native    ┌──────────────┐  HTTP    ┌──────────┐
│  扩展 (MV3)   │◄─Messaging─│  Node.js Host │─────────│  服务器   │
│              │  (stdio)   │              │  GET    │          │
│ · 下载拦截    │           │ · 流式下载    │         │          │
│ · 进度显示    │           │ · 速度计算    │         │          │
│ · 暗色 UI    │           │ · 自动命名    │         │          │
└──────────────┘           └──────────────┘         └──────────┘
```

## 🚀 快速安装

### 前提

- **Node.js** v16+ → [下载](https://nodejs.org/)
- **Microsoft Edge** v88+

### 1. 克隆

```bash
git clone https://github.com/YOUR_USER/pcl2-edge-integration.git
cd pcl2-edge-integration
```

### 2. 加载扩展

1. Edge → `edge://extensions`
2. 开启 **开发人员模式**
3. 点击 **加载解压缩的扩展**
4. 选择 `edge-extension/` 目录
5. **复制扩展 ID**（卡片上显示的一长串字母）

### 3. 注册 Native Host

```bash
cd native-host
install.bat
```

粘贴刚才复制的扩展 ID，回车。完成！

### 4. 测试

浏览任意网页，点击下载链接 → PCL2 引擎自动接管。点工具栏图标查看速度和进度。

## 📁 项目结构

```
pcl2-edge-integration/
├── edge-extension/           # Edge 扩展 (Manifest V3)
│   ├── manifest.json
│   ├── background.js         # Service Worker — 下载拦截
│   ├── popup/
│   │   ├── popup.html        # 暗色 UI
│   │   └── popup.js
│   └── icons/
├── native-host/              # Node.js Native Messaging Host
│   ├── pcl2-download-host.js # 下载引擎 + 协议处理
│   ├── install.bat           # 一键注册
│   └── test-host.js          # 独立测试
├── LICENSE
└── README.md
```

## 🔧 自定义

**修改下载目录**：编辑 `native-host/pcl2-download-host.js` 第 ~120 行：

```javascript
const downloadDir = 'D:\\下载';  // 改成你想要的路径
```

**修改线程数/超时**：同一文件中的 `threadCount: 4` 和 `timeout: 30000`。

## 🆚 与 IDM 对比

| | IDM | PCL2 Edge |
|------|-----|-----------|
| 架构 | C++ 闭源 | Node.js 开源 |
| 拦截方式 | 内核驱动+BHO+扩展 | `chrome.downloads` API |
| 视频嗅探 | ✅ | ❌ (待开发) |
| 可定制 | 低 | 高 — 全部源码 |
| 安装 | .exe 一键 | 3 步手动 |
| 价格 | $24.95 | 免费 |

## 📄 License

MIT — 随意使用、修改、分发。
