/**
 * Local Zoom Transcripts Management Dashboard
 */

(function () {
  'use strict';

  let transcripts = [];
  let currentDetail = null;
  let ws = null;

  // DOM Elements
  const elList = document.getElementById('transcripts-container');
  const elSearch = document.getElementById('search-input');
  const elSpeakerFilter = document.getElementById('speaker-filter');
  const elSidebarCount = document.getElementById('sidebar-count');
  const elSidebarPath = document.getElementById('sidebar-path');
  const elHeaderFolder = document.getElementById('header-folder-name');

  const statMeetings = document.getElementById('stat-total-meetings');
  const statWords = document.getElementById('stat-total-words');
  const statTime = document.getElementById('stat-total-time');

  const liveBanner = document.getElementById('live-banner');
  const liveTopic = document.getElementById('live-topic-name');
  const liveSpeaker = document.getElementById('live-speaker-name');
  const liveLastText = document.getElementById('live-last-text');

  // Modal Elements
  const modal = document.getElementById('detail-modal');
  const modalClose = document.getElementById('modal-close');
  const modalTopic = document.getElementById('modal-topic');
  const modalDate = document.getElementById('modal-date');
  const modalDuration = document.getElementById('modal-duration');
  const modalSpeakers = document.getElementById('modal-speakers');
  const modalMdContent = document.getElementById('modal-md-content');
  const modalTimeline = document.getElementById('modal-timeline-content');
  const modalTxt = document.getElementById('modal-txt-content');
  const modalVtt = document.getElementById('modal-vtt-content');
  const modalJson = document.getElementById('modal-json-content');
  const btnExportOpts = document.getElementById('btn-export-options');
  const exportMenu = document.getElementById('export-menu');
  const btnCopyModal = document.getElementById('btn-copy-modal');

  // Settings Elements
  const settingsSection = document.getElementById('settings-section');
  const settingDir = document.getElementById('setting-dir');
  const settingLang = document.getElementById('setting-lang');
  const fmtMd = document.getElementById('fmt-md');
  const fmtTxt = document.getElementById('fmt-txt');
  const fmtJson = document.getElementById('fmt-json');
  const fmtVtt = document.getElementById('fmt-vtt');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnTestSave = document.getElementById('btn-test-save');

  // Nav Items
  const navTranscripts = document.getElementById('nav-transcripts');
  const navSettings = document.getElementById('nav-settings');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnOpenFolder = document.getElementById('btn-open-folder');

  // -------------------------------------------------------------
  // 1. Data Fetching & Rendering
  // -------------------------------------------------------------
  async function loadTranscripts() {
    try {
      const q = elSearch.value.trim();
      const spk = elSpeakerFilter.value;
      let url = '/api/transcripts?limit=100';
      if (q) url += `&search=${encodeURIComponent(q)}`;
      if (spk) url += `&speaker=${encodeURIComponent(spk)}`;

      const res = await fetch(url);
      const data = await res.json();

      transcripts = data.transcripts || [];
      renderTranscripts(transcripts);
      updateStats(transcripts);

      if (data.transcriptsDir) {
        elSidebarPath.textContent = data.transcriptsDir;
        elHeaderFolder.textContent = data.transcriptsDir;
        settingDir.value = data.transcriptsDir;
      }
    } catch (err) {
      console.error('[Dashboard] Error loading transcripts:', err);
      elList.innerHTML = `<div class="empty-placeholder"><p>❌ Error loading transcripts from server</p></div>`;
    }
  }

  function renderTranscripts(list) {
    elSidebarCount.textContent = list.length;
    elList.innerHTML = '';

    if (list.length === 0) {
      elList.innerHTML = `
        <div class="empty-placeholder">
          <div class="empty-icon">📭</div>
          <h3>No transcripts found</h3>
          <p>Transcripts will automatically appear here whenever you leave a Zoom meeting.</p>
          <div style="margin-top: 14px; display: flex; gap: 10px;">
            <a href="/simulator" target="_blank" class="btn btn-primary">🧪 Try Meeting Simulator</a>
            <a href="/zoom-app" target="_blank" class="btn btn-secondary">🎙️ Open Zoom Panel</a>
          </div>
        </div>
      `;
      return;
    }

    // Populate speaker filter
    const allSpeakers = new Set();
    list.forEach(t => (t.speakers || []).forEach(s => allSpeakers.add(s)));
    const currentVal = elSpeakerFilter.value;
    elSpeakerFilter.innerHTML = '<option value="">All Speakers</option>';
    allSpeakers.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === currentVal) opt.selected = true;
      elSpeakerFilter.appendChild(opt);
    });

    list.forEach(t => {
      const card = document.createElement('div');
      card.className = 'transcript-card';

      const dateFormatted = new Date(t.startTime).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      card.innerHTML = `
        <div class="card-top">
          <h3 class="card-title">${escapeHtml(t.meetingTopic)}</h3>
          <span class="duration-tag">${t.durationFormatted || '00:00:00'}</span>
        </div>

        <div class="card-meta">
          <span class="meta-pill">📅 ${dateFormatted}</span>
          <span class="meta-pill">💬 ${t.utteranceCount} entries</span>
          <span class="meta-pill">📝 ${t.totalWords} words</span>
        </div>

        <div class="card-snippet">
          "${escapeHtml(t.snippet || 'No preview available')}"
        </div>

        <div class="card-speakers">
          ${(t.speakers || []).map(s => `<span class="speaker-chip">👤 ${escapeHtml(s)}</span>`).join('')}
        </div>

        <div class="card-footer">
          <div class="file-tags">
            <span class="file-tag ${t.hasFiles.md ? 'available' : ''}" title="Markdown">MD</span>
            <span class="file-tag ${t.hasFiles.txt ? 'available' : ''}" title="Text">TXT</span>
            <span class="file-tag ${t.hasFiles.json ? 'available' : ''}" title="JSON">JSON</span>
            <span class="file-tag ${t.hasFiles.vtt ? 'available' : ''}" title="WebVTT">VTT</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-sm btn-secondary btn-view" data-id="${t.id}">👁️ View</button>
            <button class="btn btn-sm btn-secondary btn-del" data-id="${t.id}" title="Delete">🗑️</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-view').addEventListener('click', () => openDetailModal(t.id));
      card.querySelector('.btn-del').addEventListener('click', () => deleteTranscript(t.id, t.meetingTopic));

      elList.appendChild(card);
    });
  }

  function updateStats(list) {
    statMeetings.textContent = list.length;
    const totalWords = list.reduce((acc, t) => acc + (t.totalWords || 0), 0);
    statWords.textContent = totalWords.toLocaleString();

    const totalSecs = list.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    statTime.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // -------------------------------------------------------------
  // 2. Detail Modal & Tabs
  // -------------------------------------------------------------
  async function openDetailModal(id) {
    try {
      const res = await fetch(`/api/transcripts/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Could not fetch transcript details');
      const data = await res.json();
      currentDetail = data;

      modalTopic.textContent = data.meetingTopic || 'Zoom Meeting';
      modalDate.textContent = new Date(data.startTime).toLocaleString();
      modalDuration.textContent = formatDuration(data.durationSeconds);
      modalSpeakers.textContent = (data.speakers || []).join(', ') || '1 Speaker';

      // Tab contents
      modalMdContent.textContent = data.fileContents.md || 'No Markdown file generated.';
      modalTxt.textContent = data.fileContents.txt || 'No Plain Text file generated.';
      modalVtt.textContent = data.fileContents.vtt || 'No WebVTT file generated.';
      modalJson.textContent = JSON.stringify(data, null, 2);

      // Render timeline
      modalTimeline.innerHTML = '';
      if (data.utterances && data.utterances.length > 0) {
        data.utterances.forEach(u => {
          const item = document.createElement('div');
          item.className = 'timeline-item';
          item.innerHTML = `
            <div class="timeline-header">
              <span class="timeline-speaker">👤 ${escapeHtml(u.speaker || 'Speaker')}</span>
              <span class="timeline-time">${formatDuration(u.timeOffsetSeconds)}</span>
            </div>
            <div class="timeline-text">${escapeHtml(u.text)}</div>
          `;
          modalTimeline.appendChild(item);
        });
      } else {
        modalTimeline.innerHTML = '<p style="color: var(--text-muted);">No dialogue lines logged.</p>';
      }

      // Setup downloads
      document.getElementById('dl-md').href = `/api/transcripts/${encodeURIComponent(id)}/download/md`;
      document.getElementById('dl-txt').href = `/api/transcripts/${encodeURIComponent(id)}/download/txt`;
      document.getElementById('dl-json').href = `/api/transcripts/${encodeURIComponent(id)}/download/json`;
      document.getElementById('dl-vtt').href = `/api/transcripts/${encodeURIComponent(id)}/download/vtt`;

      modal.classList.remove('hidden');
    } catch (err) {
      alert('Error opening transcript: ' + err.message);
    }
  }

  function closeModal() {
    modal.classList.add('hidden');
    exportMenu.classList.remove('show');
  }

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Modal Tabs Switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabKey = btn.getAttribute('data-tab');
      const targetPane = document.getElementById(`tab-${tabKey}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  btnExportOpts.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    exportMenu.classList.remove('show');
  });

  btnCopyModal.addEventListener('click', () => {
    if (currentDetail && currentDetail.fileContents && currentDetail.fileContents.md) {
      navigator.clipboard.writeText(currentDetail.fileContents.md).then(() => {
        btnCopyModal.textContent = '✅ Copied!';
        setTimeout(() => { btnCopyModal.textContent = '📋 Copy Markdown'; }, 2000);
      });
    }
  });

  // -------------------------------------------------------------
  // 3. Delete Transcript
  // -------------------------------------------------------------
  async function deleteTranscript(id, topic) {
    if (!confirm(`Delete transcript "${topic}" and all associated files (.md, .txt, .json, .vtt) from local disk?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/transcripts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        loadTranscripts();
      } else {
        alert('Failed to delete transcript');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // -------------------------------------------------------------
  // 4. WebSocket Live Updates & Monitor
  // -------------------------------------------------------------
  function setupWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'SESSION_SAVED') {
          console.log('[WS] New session auto-saved:', msg.sessionSummary);
          liveBanner.classList.add('hidden');
          loadTranscripts();
        } else if (msg.type === 'LIVE_UTTERANCE') {
          liveBanner.classList.remove('hidden');
          liveSpeaker.textContent = `(${msg.utterance.speaker || 'Speaker'})`;
          liveLastText.textContent = `"${msg.utterance.text}"`;
        } else if (msg.type === 'ROOM_JOINED_EVENT') {
          liveBanner.classList.remove('hidden');
          if (msg.session && msg.session.meetingTopic) {
            liveTopic.textContent = msg.session.meetingTopic;
          }
        } else if (msg.type === 'ROOM_LEFT_EVENT') {
          liveBanner.classList.add('hidden');
          loadTranscripts();
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setTimeout(setupWebSocket, 3000);
    };
  }

  // -------------------------------------------------------------
  // 5. Settings Handling
  // -------------------------------------------------------------
  navSettings.addEventListener('click', (e) => {
    e.preventDefault();
    navTranscripts.classList.remove('active');
    navSettings.classList.add('active');
    document.querySelector('.transcripts-section').classList.add('hidden');
    document.querySelector('.stats-grid').classList.add('hidden');
    settingsSection.classList.remove('hidden');
  });

  navTranscripts.addEventListener('click', (e) => {
    e.preventDefault();
    navSettings.classList.remove('active');
    navTranscripts.classList.add('active');
    settingsSection.classList.add('hidden');
    document.querySelector('.transcripts-section').classList.remove('hidden');
    document.querySelector('.stats-grid').classList.remove('hidden');
    loadTranscripts();
  });

  btnSaveSettings.addEventListener('click', async () => {
    const formats = [];
    if (fmtMd.checked) formats.push('md');
    if (fmtTxt.checked) formats.push('txt');
    if (fmtJson.checked) formats.push('json');
    if (fmtVtt.checked) formats.push('vtt');

    const payload = {
      transcriptsDir: settingDir.value.trim(),
      autoSaveFormats: formats,
      language: settingLang.value,
      autoSaveOnLeave: true
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Settings saved successfully!');
        loadTranscripts();
      }
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    }
  });

  btnTestSave.addEventListener('click', async () => {
    try {
      const testSession = {
        meetingId: 'TEST-' + Math.floor(Math.random() * 900000 + 100000),
        meetingTopic: 'Windows 11 Test Meeting',
        startTime: new Date(Date.now() - 120000).toISOString(),
        endTime: new Date().toISOString(),
        durationSeconds: 120,
        speakers: ['You (Host)', 'Colleague'],
        utterances: [
          { speaker: 'You (Host)', text: 'Testing auto-transcription on Windows 11 Zoom Workplace.', timeOffsetSeconds: 5 },
          { speaker: 'Colleague', text: 'All files are automatically written to local disk upon leaving the room.', timeOffsetSeconds: 25 },
          { speaker: 'You (Host)', text: 'Excellent, verifying Markdown, Text, JSON and WebVTT generation.', timeOffsetSeconds: 50 }
        ],
        metadata: { client: 'Windows 11 Zoom Workplace Test' }
      };

      const res = await fetch('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testSession)
      });

      const data = await res.json();
      if (data.success) {
        alert('✅ Sample transcript created and saved to ' + data.savedDirectory);
        loadTranscripts();
      }
    } catch (e) {
      alert('Error creating sample: ' + e.message);
    }
  });

  // -------------------------------------------------------------
  // Helpers & Event Listeners
  // -------------------------------------------------------------
  elSearch.addEventListener('input', debounce(loadTranscripts, 300));
  elSpeakerFilter.addEventListener('change', loadTranscripts);
  btnRefresh.addEventListener('click', loadTranscripts);

  btnOpenFolder.addEventListener('click', () => {
    alert(`📁 Saved Transcripts Location:\n\n${elSidebarPath.textContent}\n\nFiles are automatically written here in .md, .txt, .json, and .vtt formats.`);
  });

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
  }

  // Initialization
  loadTranscripts();
  setupWebSocket();
})();
