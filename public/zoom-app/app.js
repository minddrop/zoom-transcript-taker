/**
 * Zoom Workplace (v7.1.5 Native Windows App) Auto-Transcript Controller
 * Automatically starts transcription on enter room and saves to local files on leave room.
 */

(function () {
  'use strict';

  // State
  const state = {
    inMeeting: false,
    meetingId: 'LOCAL-SESSION-' + Date.now().toString(36),
    meetingTopic: 'Zoom Workplace Meeting',
    currentSpeaker: 'You (Participant)',
    startTime: null,
    endTime: null,
    durationSeconds: 0,
    utterances: [],
    speakers: new Set(),
    isRecording: false,
    isMuted: false,
    timerInterval: null,
    recognition: null,
    ws: null,
    hasAutoSaved: false,
    apiBaseUrl: window.location.origin
  };

  // DOM Elements
  const elTopic = document.getElementById('meeting-topic');
  const elId = document.getElementById('meeting-id');
  const elSpeaker = document.getElementById('current-speaker');
  const elTimer = document.getElementById('timer-display');
  const elUtteranceCount = document.getElementById('utterance-count');
  const elWordCount = document.getElementById('word-count');
  const elStatus = document.getElementById('connection-status');
  const elFeed = document.getElementById('transcript-feed');
  const elEmptyState = document.getElementById('empty-state');
  const elVisualizer = document.getElementById('audio-visualizer');
  const elAudioStateText = document.getElementById('audio-state-text');
  const elInterimBubble = document.getElementById('interim-bubble');
  const elInterimSpeaker = document.getElementById('interim-speaker');
  const elInterimText = document.getElementById('interim-text');
  const elToast = document.getElementById('save-toast');
  const elToastDetails = document.getElementById('toast-details');

  const btnToggleMic = document.getElementById('btn-toggle-mic');
  const micIcon = document.getElementById('mic-icon');
  const micText = document.getElementById('mic-text');
  const btnSaveNow = document.getElementById('btn-save-now');
  const btnCopy = document.getElementById('btn-copy');
  const btnClear = document.getElementById('btn-clear');

  // --------------------------------------------------------------------------
  // 1. Zoom Apps SDK Initialization
  // --------------------------------------------------------------------------
  async function initializeZoomApp() {
    updateStatus('connecting', 'Connecting to Zoom...');

    if (typeof window.zoomSdk !== 'undefined') {
      try {
        console.log('[Zoom App] Initializing Zoom Apps SDK...');
        const configResponse = await window.zoomSdk.config({
          version: '0.16',
          capabilities: [
            'getRunningContext',
            'getMeetingContext',
            'getUserContext',
            'onMeeting',
            'onClose',
            'showNotification',
            'openUrl'
          ]
        });

        console.log('[Zoom App] SDK Configured:', configResponse);

        // Get running context
        const context = await window.zoomSdk.getRunningContext();
        console.log('[Zoom App] Running Context:', context);

        // Setup Zoom SDK event listeners
        window.zoomSdk.addEventListener('onMeeting', handleMeetingEvent);
        window.zoomSdk.addEventListener('onClose', handleAppClose);

        if (context === 'inMeeting') {
          await handleRoomJoinedZoom();
        } else {
          updateStatus('active', 'Zoom Client Ready');
          elTopic.textContent = 'Waiting to join meeting room...';
          // Auto-start listening mode
          startAutoTranscription();
        }
      } catch (err) {
        console.warn('[Zoom App] Zoom SDK config error (running in companion/standalone mode):', err);
        initFallbackMode();
      }
    } else {
      console.log('[Zoom App] zoomSdk not injected. Running in Companion/Local mode.');
      initFallbackMode();
    }
  }

  async function handleRoomJoinedZoom() {
    try {
      const meetingContext = await window.zoomSdk.getMeetingContext();
      if (meetingContext) {
        state.meetingId = meetingContext.meetingID || meetingContext.meetingId || state.meetingId;
        state.meetingTopic = meetingContext.meetingTopic || 'Zoom Workplace Meeting';
      }
    } catch (e) {
      console.log('[Zoom App] Could not get meeting context:', e);
    }

    try {
      const userContext = await window.zoomSdk.getUserContext();
      if (userContext && userContext.screenName) {
        state.currentSpeaker = userContext.screenName;
      }
    } catch (e) {
      console.log('[Zoom App] Could not get user context:', e);
    }

    updateUIHeaders();
    startAutoTranscription();
  }

  function handleMeetingEvent(event) {
    console.log('[Zoom App] onMeeting Event:', event);
    if (event.action === 'ended') {
      console.log('[Zoom App] Meeting ended detected via Zoom SDK -> Triggering Auto-Save');
      triggerAutoSave('Meeting Ended (Zoom SDK onMeeting)');
    } else if (event.action === 'started') {
      console.log('[Zoom App] Meeting started detected via Zoom SDK');
      startAutoTranscription();
    }
  }

  function handleAppClose() {
    console.log('[Zoom App] onClose Event detected -> Triggering Auto-Save');
    triggerAutoSave('Zoom App Closing');
  }

  function initFallbackMode() {
    updateStatus('active', 'Local Active');
    updateUIHeaders();
    startAutoTranscription();
  }

  function updateStatus(type, text) {
    elStatus.className = 'status-badge ' + type;
    const textEl = elStatus.querySelector('.status-text');
    if (textEl) textEl.textContent = text;
  }

  function updateUIHeaders() {
    elTopic.textContent = state.meetingTopic;
    elId.textContent = state.meetingId;
    elSpeaker.textContent = state.currentSpeaker;
    state.speakers.add(state.currentSpeaker);
  }

  // --------------------------------------------------------------------------
  // 2. Continuous Speech Recognition Engine (Auto-Starts on Room Join)
  // --------------------------------------------------------------------------
  function startAutoTranscription() {
    if (state.isRecording) return;

    state.inMeeting = true;
    state.isRecording = true;
    state.hasAutoSaved = false;
    state.startTime = state.startTime || new Date().toISOString();

    // Start timer
    if (!state.timerInterval) {
      const startMs = new Date(state.startTime).getTime();
      state.timerInterval = setInterval(() => {
        state.durationSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        elTimer.textContent = formatDuration(state.durationSeconds);
      }, 1000);
    }

    // Connect WebSocket for live companion streaming
    connectWebSocket();

    // Check Speech Recognition support in WebView2 / Browser
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[Speech] SpeechRecognition API not supported directly in this webview.');
      elAudioStateText.textContent = 'Speech API not available (Audio simulation ready)';
      return;
    }

    try {
      if (state.recognition) {
        try { state.recognition.abort(); } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        console.log('[Speech] Recognition started');
        elVisualizer.classList.add('active');
        elAudioStateText.textContent = 'Auto-Transcription Active';
        updateStatus('active', 'Listening');
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptPiece = event.results[i][0].transcript;
          const confidence = event.results[i][0].confidence || 0.95;

          if (event.results[i].isFinal) {
            const cleanText = transcriptPiece.trim();
            if (cleanText) {
              addUtterance({
                speaker: state.currentSpeaker,
                text: cleanText,
                confidence: Number(confidence.toFixed(2)),
                timeOffsetSeconds: state.durationSeconds,
                timestamp: new Date().toISOString()
              });
            }
          } else {
            interimTranscript += transcriptPiece;
          }
        }

        // Display interim results
        if (interimTranscript.trim()) {
          elInterimBubble.classList.remove('hidden');
          elInterimSpeaker.textContent = state.currentSpeaker + ':';
          elInterimText.textContent = interimTranscript;
        } else {
          elInterimBubble.classList.add('hidden');
        }
      };

      recognition.onerror = (event) => {
        console.warn('[Speech] Recognition event error:', event.error);
        if (event.error === 'not-allowed') {
          updateStatus('connecting', 'Microphone Permission Needed');
          elAudioStateText.textContent = 'Microphone access blocked';
        }
      };

      recognition.onend = () => {
        console.log('[Speech] Recognition ended.');
        elInterimBubble.classList.add('hidden');
        // Auto-restart if meeting is still active and not manually muted
        if (state.isRecording && !state.isMuted) {
          setTimeout(() => {
            if (state.isRecording && !state.isMuted) {
              try {
                recognition.start();
              } catch (e) {
                console.log('[Speech] Restart retry error:', e);
              }
            }
          }, 300);
        } else {
          elVisualizer.classList.remove('active');
        }
      };

      recognition.start();
      state.recognition = recognition;
    } catch (err) {
      console.error('[Speech] Could not start speech recognition:', err);
    }
  }

  // --------------------------------------------------------------------------
  // 3. Utterance Feed & Live Sync
  // --------------------------------------------------------------------------
  function addUtterance(utterance) {
    state.utterances.push(utterance);
    state.speakers.add(utterance.speaker);

    if (elEmptyState) {
      elEmptyState.remove();
    }

    // Render utterance card
    const card = document.createElement('div');
    const isSelf = utterance.speaker.includes('You') || utterance.speaker === state.currentSpeaker;
    card.className = 'utterance-item' + (isSelf ? '' : ' speaker-other');

    const meta = document.createElement('div');
    meta.className = 'utterance-meta';

    const spk = document.createElement('span');
    spk.className = 'utterance-speaker';
    spk.textContent = utterance.speaker;

    const time = document.createElement('span');
    time.className = 'utterance-time';
    time.textContent = formatDuration(utterance.timeOffsetSeconds);

    meta.appendChild(spk);
    meta.appendChild(time);

    const txt = document.createElement('div');
    txt.className = 'utterance-text';
    txt.textContent = utterance.text;

    card.appendChild(meta);
    card.appendChild(txt);

    elFeed.appendChild(card);
    elFeed.scrollTop = elFeed.scrollHeight;

    // Update counts
    elUtteranceCount.textContent = state.utterances.length;
    const totalWords = state.utterances.reduce((acc, u) => acc + (u.text ? u.text.split(/\s+/).filter(Boolean).length : 0), 0);
    elWordCount.textContent = totalWords;

    // Stream chunk to local server
    streamChunkToServer(utterance);
  }

  async function streamChunkToServer(utterance) {
    try {
      fetch(state.apiBaseUrl + '/api/transcripts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: state.meetingId,
          utterance,
          sessionMetadata: {
            meetingTopic: state.meetingTopic,
            startTime: state.startTime
          }
        }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // 4. Auto-Save on Leave Room
  // --------------------------------------------------------------------------
  async function triggerAutoSave(reason = 'Room Left') {
    if (state.hasAutoSaved) {
      console.log('[Auto-Save] Session already auto-saved. Skipping duplicate trigger.');
      return;
    }

    console.log(`[Auto-Save] Triggered by: ${reason}. Saving ${state.utterances.length} utterances...`);
    state.hasAutoSaved = true;
    state.endTime = new Date().toISOString();

    // Prepare complete meeting payload
    const payload = {
      meetingId: state.meetingId,
      meetingTopic: state.meetingTopic,
      startTime: state.startTime || new Date().toISOString(),
      endTime: state.endTime,
      durationSeconds: state.durationSeconds,
      speakers: Array.from(state.speakers),
      utterances: state.utterances,
      metadata: {
        autoSaved: true,
        savedReason: reason,
        zoomWorkplaceVersion: '7.1.5',
        clientPlatform: 'Windows 11'
      }
    };

    // 1. Post to Local Companion Server (writes .md, .txt, .json, .vtt to local disk)
    try {
      const response = await fetch(state.apiBaseUrl + '/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      });

      const resData = await response.json();
      console.log('[Auto-Save] Server response:', resData);

      showAutoSaveToast(resData.baseFilename || 'Saved to ./transcripts/');
    } catch (err) {
      console.warn('[Auto-Save] Local server post failed, executing fallback download:', err);
      fallbackLocalFileDownload(payload);
    }

    // Stop recording and timer
    if (state.recognition) {
      try { state.recognition.stop(); } catch (e) {}
    }
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }
    elVisualizer.classList.remove('active');
    updateStatus('active', 'Auto-Saved to Local Disk');
  }

  // Instant fallback local file download if server is unreachable
  function fallbackLocalFileDownload(session) {
    try {
      const filename = `ZoomTranscript_${(session.meetingTopic || 'Meeting').replace(/\s+/g, '_')}_${Date.now()}.md`;
      let content = `# 📝 Meeting Transcript: ${session.meetingTopic}\n\n`;
      content += `**Date:** ${new Date().toLocaleString()}\n`;
      content += `**Duration:** ${formatDuration(session.durationSeconds)}\n\n---\n\n`;
      session.utterances.forEach(u => {
        content += `**${u.speaker}** [${formatDuration(u.timeOffsetSeconds)}]: ${u.text}\n\n`;
      });

      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showAutoSaveToast('Downloaded locally: ' + filename);
    } catch (e) {
      console.error('[Auto-Save] Fallback download failed:', e);
    }
  }

  function showAutoSaveToast(details) {
    if (!elToast) return;
    elToastDetails.textContent = details;
    elToast.classList.remove('hidden');
    setTimeout(() => {
      elToast.classList.add('hidden');
    }, 5000);
  }

  // --------------------------------------------------------------------------
  // 5. Lifecycle Window & Page Event Listeners
  // --------------------------------------------------------------------------
  window.addEventListener('beforeunload', () => {
    triggerAutoSave('Window BeforeUnload / Room Left');
  });

  window.addEventListener('pagehide', () => {
    triggerAutoSave('Page Hide / Room Left');
  });

  // --------------------------------------------------------------------------
  // 6. WebSocket Companion Connection
  // --------------------------------------------------------------------------
  function connectWebSocket() {
    if (state.ws) return;
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected to Companion Server');
        ws.send(JSON.stringify({
          type: 'ROOM_JOINED',
          session: {
            meetingId: state.meetingId,
            meetingTopic: state.meetingTopic
          }
        }));
      };

      ws.onerror = (e) => {
        console.warn('[WS] WebSocket error:', e);
      };

      state.ws = ws;
    } catch (e) {
      console.warn('[WS] Connection failed:', e);
    }
  }

  // --------------------------------------------------------------------------
  // 7. UI Controls & Helpers
  // --------------------------------------------------------------------------
  btnToggleMic.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    if (state.isMuted) {
      if (state.recognition) {
        try { state.recognition.stop(); } catch (e) {}
      }
      micIcon.textContent = '🔇';
      micText.textContent = 'Resume Mic';
      elVisualizer.classList.remove('active');
      elAudioStateText.textContent = 'Microphone Paused';
    } else {
      micIcon.textContent = '🎤';
      micText.textContent = 'Pause Mic';
      startAutoTranscription();
    }
  });

  btnSaveNow.addEventListener('click', () => {
    triggerAutoSave('User Clicked Save Now');
  });

  btnCopy.addEventListener('click', () => {
    const text = state.utterances.map(u => `[${formatDuration(u.timeOffsetSeconds)}] ${u.speaker}: ${u.text}`).join('\n');
    navigator.clipboard.writeText(text || 'No dialogue yet.').then(() => {
      btnCopy.textContent = '✅ Copied!';
      setTimeout(() => { btnCopy.textContent = '📋 Copy'; }, 2000);
    });
  });

  btnClear.addEventListener('click', () => {
    if (confirm('Clear current view? (Saved files on disk will not be affected)')) {
      elFeed.innerHTML = '';
      elUtteranceCount.textContent = '0';
      elWordCount.textContent = '0';
    }
  });

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
  }

  // Expose test helper for simulator
  window.AutoTranscriptApp = {
    addUtterance,
    triggerAutoSave,
    state
  };

  // Start on load
  window.addEventListener('DOMContentLoaded', initializeZoomApp);
})();
