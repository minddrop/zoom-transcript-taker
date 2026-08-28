/**
 * Windows 11 Native Zoom Process & Meeting Watcher
 * Monitors Zoom.exe / CptHost.exe on Windows 11 and acts as an auxiliary safety net.
 */

const { exec } = require('child_process');
const http = require('http');

const CHECK_INTERVAL_MS = 3000;
const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:3000';

let isZoomRunning = false;
let zoomMeetingDetected = false;

function checkZoomProcess() {
  const isWindows = process.platform === 'win32';
  const command = isWindows
    ? 'tasklist /FI "IMAGENAME eq Zoom.exe" /NH'
    : 'pgrep -i zoom || true';

  exec(command, (err, stdout) => {
    if (err) return;

    const currentlyRunning = stdout.toLowerCase().includes('zoom');

    if (currentlyRunning && !isZoomRunning) {
      console.log('🔍 [Windows 11 Watcher] Zoom Workplace process detected running.');
      isZoomRunning = true;
    } else if (!currentlyRunning && isZoomRunning) {
      console.log('🚪 [Windows 11 Watcher] Zoom Workplace process closed. Triggering local backup auto-save signal...');
      isZoomRunning = false;
      notifyServerProcessClosed();
    }
  });
}

function notifyServerProcessClosed() {
  const postData = JSON.stringify({
    type: 'PROCESS_WATCHER_CLOSE',
    timestamp: new Date().toISOString()
  });

  const req = http.request(
    SERVER_URL + '/api/transcripts/stream',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 2000
    },
    res => {}
  );

  req.on('error', () => {});
  req.write(postData);
  req.end();
}

console.log('🛡️ [Windows 11 Watcher] Started Zoom process watcher (checking every 3s)...');
setInterval(checkZoomProcess, CHECK_INTERVAL_MS);
checkZoomProcess();
