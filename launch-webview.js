const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { startServer } = require('./server');

const MAC_BINARY_PATH = path.join(__dirname, 'irisTV.app', 'Contents', 'MacOS', 'iristv-webview');

function spawnTvFrontend(url) {
  if (process.platform === 'darwin' && fs.existsSync(MAC_BINARY_PATH)) {
    console.log(`\n  🌈 irisTV WKWebView (macOS) iniciando em ${url}\n`);
    return spawn(MAC_BINARY_PATH, [url], { stdio: 'inherit' });
  }

  if (process.platform === 'win32') {
    const winBrowsers = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    const browserExe = winBrowsers.find((p) => fs.existsSync(p));
    if (browserExe) {
      console.log(`\n  🌈 irisTV (Windows App Mode) iniciando em ${url}\n`);
      return spawn(browserExe, [`--app=${url}`, '--start-fullscreen', '--force_high_performance_gpu', '--enable-gpu-rasterization', '--enable-zero-copy'], { stdio: 'inherit' });
    }
    console.log(`\n  🌈 irisTV rodando no navegador em ${url}\n`);
    return spawn('cmd', ['/c', 'start', '', url], { stdio: 'inherit' });
  }

  console.log(`\n  🌈 irisTV Server rodando em ${url} (abra no navegador)\n`);
  return null;
}

startServer(Number(process.env.PORT) || 3000)
  .then(({ server, url }) => {
    const child = spawnTvFrontend(url);

    if (child) {
      child.on('exit', (code) => {
        if (process.platform === 'darwin') {
          try { server.close(); } catch (_) {}
          process.exit(code || 0);
        }
      });
    }

    const shutdown = () => {
      try { child?.kill(); } catch (_) {}
      try { server.close(); } catch (_) {}
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((err) => {
    console.error('Erro ao iniciar irisTV:', err);
    process.exit(1);
  });
