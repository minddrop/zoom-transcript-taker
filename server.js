const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const TRANSCRIPTS_DIR = path.resolve(process.env.TRANSCRIPTS_DIR || path.join(__dirname, 'transcripts'));
const AUTO_SAVE_FORMATS = (process.env.AUTO_SAVE_FORMATS || 'md,txt,json,vtt').split(',').map(f => f.trim().toLowerCase());

// In-memory active meeting stream buffer (prevents data loss if connection drops)
const activeStreams = new Map();

// Configuration state
const serverConfig = {
  transcriptsDir: TRANSCRIPTS_DIR,
  autoSaveFormats: AUTO_SAVE_FORMATS,
  language: process.env.DEFAULT_LANGUAGE || 'en-US',
  autoSaveOnLeave: true,
  streamIntervalMs: 2000,
};

// Ensure transcripts directory exists
if (!fs.existsSync(TRANSCRIPTS_DIR)) {
  fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
}

// -------------------------------------------------------------
// Zoom Marketplace & OWASP Security Headers
// -------------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://appssdk.zoom.us wss: ws: http://127.0.0.1:* http://localhost:*; media-src 'self' blob: mediastream:; connect-src 'self' ws://* wss://* http://* https://*;"
  );
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// Helper Formatters for Local Files
// -------------------------------------------------------------
function sanitizeFilename(name) {
  return (name || 'Meeting')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 80);
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
}

function formatTimestampOffset(offsetSec) {
  const s = Math.max(0, Math.floor(offsetSec || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `[${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
}

function formatVttTime(offsetSec) {
  const s = Math.max(0, offsetSec || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// Generate Markdown format
function generateMarkdown(session) {
  const topic = session.meetingTopic || 'Zoom Meeting';
  const meetingId = session.meetingId || 'N/A';
  const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : new Date().toLocaleString();
  const endTime = session.endTime ? new Date(session.endTime).toLocaleString() : new Date().toLocaleString();
  const duration = formatDuration(session.durationSeconds);
  const utterances = session.utterances || [];
  const speakers = session.speakers || [...new Set(utterances.map(u => u.speaker).filter(Boolean))];
  const totalWords = utterances.reduce((acc, u) => acc + (u.text ? u.text.split(/\s+/).filter(Boolean).length : 0), 0);

  let md = `# 📝 Meeting Transcript: ${topic}\n\n`;
  md += `## ℹ️ Session Overview\n\n`;
  md += `| Field | Value |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Topic** | ${topic} |\n`;
  md += `| **Meeting ID** | \`${meetingId}\` |\n`;
  md += `| **Start Time** | ${startTime} |\n`;
  md += `| **End Time** | ${endTime} |\n`;
  md += `| **Duration** | \`${duration}\` |\n`;
  md += `| **Participants / Speakers** | ${speakers.length > 0 ? speakers.join(', ') : '1 Speaker'} |\n`;
  md += `| **Total Words** | ${totalWords} |\n`;
  md += `| **Auto-Saved By** | Zoom Workplace (v7.1.5 Windows 11) Auto-Transcript Plugin |\n\n`;
  md += `---\n\n`;
  md += `## 💬 Full Transcript\n\n`;

  if (utterances.length === 0) {
    md += `*No dialogue captured during this session.*\n`;
  } else {
    let currentSpeaker = null;
    utterances.forEach(u => {
      const timeStr = formatTimestampOffset(u.timeOffsetSeconds);
      const speaker = u.speaker || 'Participant';
      if (speaker !== currentSpeaker) {
        md += `\n### 👤 **${speaker}** \`${timeStr}\`\n`;
        currentSpeaker = speaker;
      }
      md += `> ${u.text}\n\n`;
    });
  }

  md += `\n---\n*Auto-generated & saved locally on ${new Date().toLocaleString()}*\n`;
  return md;
}

// Generate Plain Text format
function generatePlainText(session) {
  const topic = session.meetingTopic || 'Zoom Meeting';
  const meetingId = session.meetingId || 'N/A';
  const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : new Date().toLocaleString();
  const duration = formatDuration(session.durationSeconds);
  const utterances = session.utterances || [];

  let txt = `=================================================================\n`;
  txt += `ZOOM WORKPLACE MEETING TRANSCRIPT\n`;
  txt += `Topic:      ${topic}\n`;
  txt += `Meeting ID: ${meetingId}\n`;
  txt += `Date/Time:  ${startTime}\n`;
  txt += `Duration:   ${duration}\n`;
  txt += `=================================================================\n\n`;

  utterances.forEach(u => {
    const timeStr = formatTimestampOffset(u.timeOffsetSeconds);
    const speaker = u.speaker || 'Speaker';
    txt += `${timeStr} ${speaker}: ${u.text}\n`;
  });

  return txt;
}

// Generate WebVTT format
function generateWebVTT(session) {
  const utterances = session.utterances || [];
  let vtt = `WEBVTT - Zoom Meeting: ${session.meetingTopic || 'Meeting'}\n\n`;

  utterances.forEach((u, idx) => {
    const startSec = u.timeOffsetSeconds || (idx * 3);
    const endSec = startSec + Math.max(2, Math.min(8, (u.text ? u.text.length * 0.08 : 3)));
    vtt += `${idx + 1}\n`;
    vtt += `${formatVttTime(startSec)} --> ${formatVttTime(endSec)}\n`;
    vtt += `<v ${u.speaker || 'Speaker'}>${u.text}\n\n`;
  });

  return vtt;
}

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

// System Status & Health
app.get('/api/status', (req, res) => {
  try {
    const files = fs.readdirSync(serverConfig.transcriptsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    res.json({
      status: 'online',
      version: '1.0.0',
      zoomWorkplaceVersion: '7.1.5',
      platform: 'Windows 11',
      transcriptsDir: serverConfig.transcriptsDir,
      totalTranscripts: jsonFiles.length,
      autoSaveFormats: serverConfig.autoSaveFormats,
      activeStreamCount: activeStreams.size,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Config endpoints
app.get('/api/config', (req, res) => {
  res.json(serverConfig);
});

app.post('/api/config', (req, res) => {
  const { transcriptsDir, autoSaveFormats, language, autoSaveOnLeave } = req.body;
  if (transcriptsDir && typeof transcriptsDir === 'string') {
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    serverConfig.transcriptsDir = path.resolve(transcriptsDir);
  }
  if (Array.isArray(autoSaveFormats)) {
    serverConfig.autoSaveFormats = autoSaveFormats.map(f => f.trim().toLowerCase());
  }
  if (language) {
    serverConfig.language = language;
  }
  if (typeof autoSaveOnLeave === 'boolean') {
    serverConfig.autoSaveOnLeave = autoSaveOnLeave;
  }
  res.json({ success: true, config: serverConfig });
});

// Streaming Chunks (Real-time live buffer)
app.post('/api/transcripts/stream', (req, res) => {
  const { meetingId, utterance, sessionMetadata } = req.body;
  if (!meetingId) {
    return res.status(400).json({ error: 'meetingId is required' });
  }

  if (!activeStreams.has(meetingId)) {
    activeStreams.set(meetingId, {
      meetingId,
      meetingTopic: sessionMetadata?.meetingTopic || 'Zoom Meeting',
      startTime: sessionMetadata?.startTime || new Date().toISOString(),
      utterances: [],
      speakers: new Set(),
      lastActivity: Date.now()
    });
  }

  const stream = activeStreams.get(meetingId);
  stream.lastActivity = Date.now();
  if (sessionMetadata?.meetingTopic) {
    stream.meetingTopic = sessionMetadata.meetingTopic;
  }

  if (utterance && utterance.text) {
    stream.utterances.push(utterance);
    if (utterance.speaker) {
      stream.speakers.add(utterance.speaker);
    }

    // Broadcast to WebSocket clients (live dashboard)
    broadcastWs({
      type: 'LIVE_UTTERANCE',
      meetingId,
      utterance,
      totalUtterances: stream.utterances.length
    });
  }

  res.json({ success: true, count: stream.utterances.length });
});

// Auto-Save Full Session (Triggered automatically on Room Leave)
app.post('/api/transcripts', (req, res) => {
  try {
    const session = req.body;
    if (!session || !session.meetingId) {
      return res.status(400).json({ error: 'Invalid meeting session payload' });
    }

    // Merge with any in-memory stream buffer if available
    if (activeStreams.has(session.meetingId)) {
      const buffered = activeStreams.get(session.meetingId);
      if ((!session.utterances || session.utterances.length === 0) && buffered.utterances.length > 0) {
        session.utterances = buffered.utterances;
      }
      activeStreams.delete(session.meetingId);
    }

    session.utterances = session.utterances || [];
    session.speakers = session.speakers || [...new Set(session.utterances.map(u => u.speaker).filter(Boolean))];
    session.startTime = session.startTime || new Date().toISOString();
    session.endTime = session.endTime || new Date().toISOString();
    
    const startMs = new Date(session.startTime).getTime();
    const endMs = new Date(session.endTime).getTime();
    session.durationSeconds = session.durationSeconds || Math.max(1, Math.round((endMs - startMs) / 1000));

    // Create unique timestamped file prefix
    const dateObj = new Date(session.startTime);
    const dateStr = dateObj.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeTopic = sanitizeFilename(session.meetingTopic || 'Zoom_Meeting');
    const safeId = (session.meetingId || 'session').replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseFilename = `${dateStr}_${safeTopic}_${safeId}`;
    const id = baseFilename;

    session.id = id;
    session.baseFilename = baseFilename;
    session.savedAt = new Date().toISOString();

    const formatsToSave = serverConfig.autoSaveFormats;
    const savedFiles = [];

    // 1. JSON Data
    if (formatsToSave.includes('json')) {
      const jsonPath = path.join(serverConfig.transcriptsDir, `${baseFilename}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(session, null, 2), 'utf8');
      savedFiles.push({ format: 'json', filename: `${baseFilename}.json`, path: jsonPath });
    }

    // 2. Markdown Note
    if (formatsToSave.includes('md') || formatsToSave.includes('markdown')) {
      const mdContent = generateMarkdown(session);
      const mdPath = path.join(serverConfig.transcriptsDir, `${baseFilename}.md`);
      fs.writeFileSync(mdPath, mdContent, 'utf8');
      savedFiles.push({ format: 'md', filename: `${baseFilename}.md`, path: mdPath });
    }

    // 3. Plain Text Transcript
    if (formatsToSave.includes('txt') || formatsToSave.includes('text')) {
      const txtContent = generatePlainText(session);
      const txtPath = path.join(serverConfig.transcriptsDir, `${baseFilename}.txt`);
      fs.writeFileSync(txtPath, txtContent, 'utf8');
      savedFiles.push({ format: 'txt', filename: `${baseFilename}.txt`, path: txtPath });
    }

    // 4. WebVTT Captions
    if (formatsToSave.includes('vtt')) {
      const vttContent = generateWebVTT(session);
      const vttPath = path.join(serverConfig.transcriptsDir, `${baseFilename}.vtt`);
      fs.writeFileSync(vttPath, vttContent, 'utf8');
      savedFiles.push({ format: 'vtt', filename: `${baseFilename}.vtt`, path: vttPath });
    }

    console.log(`[Auto-Save] Successfully saved meeting "${session.meetingTopic}" (${session.utterances.length} utterances) to ${serverConfig.transcriptsDir}`);

    // Broadcast save event to WebSocket clients
    broadcastWs({
      type: 'SESSION_SAVED',
      sessionSummary: {
        id,
        meetingId: session.meetingId,
        topic: session.meetingTopic,
        startTime: session.startTime,
        durationSeconds: session.durationSeconds,
        utteranceCount: session.utterances.length,
        savedFiles
      }
    });

    res.json({
      success: true,
      id,
      baseFilename,
      savedFiles,
      utteranceCount: session.utterances.length,
      savedDirectory: serverConfig.transcriptsDir
    });
  } catch (err) {
    console.error('[Auto-Save Error]', err);
    res.status(500).json({ error: 'Failed to auto-save transcript: ' + err.message });
  }
});

// List all saved transcripts
app.get('/api/transcripts', (req, res) => {
  try {
    const { search, speaker, limit = 50 } = req.query;
    const files = fs.readdirSync(serverConfig.transcriptsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

    const transcripts = [];

    for (const file of jsonFiles) {
      if (transcripts.length >= parseInt(limit, 10)) break;
      try {
        const fullPath = path.join(serverConfig.transcriptsDir, file);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

        const totalWords = (data.utterances || []).reduce(
          (acc, u) => acc + (u.text ? u.text.split(/\s+/).filter(Boolean).length : 0),
          0
        );

        const baseName = data.baseFilename || file.replace('.json', '');

        const summary = {
          id: data.id || baseName,
          baseFilename: baseName,
          meetingId: data.meetingId || 'N/A',
          meetingTopic: data.meetingTopic || 'Zoom Meeting',
          startTime: data.startTime || new Date().toISOString(),
          endTime: data.endTime || new Date().toISOString(),
          durationSeconds: data.durationSeconds || 0,
          durationFormatted: formatDuration(data.durationSeconds || 0),
          speakers: data.speakers || [],
          utteranceCount: (data.utterances || []).length,
          totalWords,
          snippet: data.utterances && data.utterances.length > 0 ? data.utterances[0].text : 'No dialogue recorded.',
          hasFiles: {
            json: fs.existsSync(path.join(serverConfig.transcriptsDir, `${baseName}.json`)),
            md: fs.existsSync(path.join(serverConfig.transcriptsDir, `${baseName}.md`)),
            txt: fs.existsSync(path.join(serverConfig.transcriptsDir, `${baseName}.txt`)),
            vtt: fs.existsSync(path.join(serverConfig.transcriptsDir, `${baseName}.vtt`)),
          }
        };

        // Filter by search query if provided
        if (search) {
          const q = search.toLowerCase();
          const matchesTopic = summary.meetingTopic.toLowerCase().includes(q);
          const matchesSnippet = summary.snippet.toLowerCase().includes(q);
          const matchesDialogue = (data.utterances || []).some(u => u.text && u.text.toLowerCase().includes(q));
          if (!matchesTopic && !matchesSnippet && !matchesDialogue) {
            continue;
          }
        }

        // Filter by speaker
        if (speaker) {
          const spk = speaker.toLowerCase();
          const hasSpeaker = (summary.speakers || []).some(s => s.toLowerCase().includes(spk));
          if (!hasSpeaker) {
            continue;
          }
        }

        transcripts.push(summary);
      } catch (readErr) {
        console.warn(`[Read Warning] Could not parse ${file}:`, readErr.message);
      }
    }

    res.json({ transcripts, total: transcripts.length, transcriptsDir: serverConfig.transcriptsDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get detailed transcript content
app.get('/api/transcripts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const files = fs.readdirSync(serverConfig.transcriptsDir);
    
    // Find matching json file by filename or inside file
    let targetJson = files.find(f => f.endsWith('.json') && (f === `${id}.json` || f.startsWith(id) || f.includes(id)));

    if (!targetJson) {
      // Check data inside files
      for (const f of files.filter(x => x.endsWith('.json'))) {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(serverConfig.transcriptsDir, f), 'utf8'));
          if (d.id === id || d.baseFilename === id || d.meetingId === id) {
            targetJson = f;
            break;
          }
        } catch (e) {}
      }
    }

    if (!targetJson) {
      return res.status(404).json({ error: 'Transcript session not found' });
    }

    const fullPath = path.join(serverConfig.transcriptsDir, targetJson);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const baseName = data.baseFilename || targetJson.replace('.json', '');

    // Read companion text & markdown if present
    let mdContent = null;
    let txtContent = null;
    let vttContent = null;

    const mdPath = path.join(serverConfig.transcriptsDir, `${baseName}.md`);
    if (fs.existsSync(mdPath)) {
      mdContent = fs.readFileSync(mdPath, 'utf8');
    }

    const txtPath = path.join(serverConfig.transcriptsDir, `${baseName}.txt`);
    if (fs.existsSync(txtPath)) {
      txtContent = fs.readFileSync(txtPath, 'utf8');
    }

    const vttPath = path.join(serverConfig.transcriptsDir, `${baseName}.vtt`);
    if (fs.existsSync(vttPath)) {
      vttContent = fs.readFileSync(vttPath, 'utf8');
    }

    res.json({
      ...data,
      fileContents: {
        md: mdContent,
        txt: txtContent,
        vtt: vttContent
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download specific format
app.get('/api/transcripts/:id/download/:format', (req, res) => {
  try {
    const { id, format } = req.params;
    const files = fs.readdirSync(serverConfig.transcriptsDir);
    const targetExt = `.${format.toLowerCase()}`;
    const targetFile = files.find(f => f.endsWith(targetExt) && (f.startsWith(id) || f.includes(id) || f.replace(targetExt, '') === id));

    if (!targetFile) {
      return res.status(404).json({ error: `File format ${format} not found for this transcript` });
    }

    const filePath = path.join(serverConfig.transcriptsDir, targetFile);
    res.download(filePath, targetFile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete transcript
app.delete('/api/transcripts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const files = fs.readdirSync(serverConfig.transcriptsDir);
    const relatedFiles = files.filter(f => f.startsWith(id) || f.includes(id) || f.replace(/\.[^.]+$/, '') === id);

    if (relatedFiles.length === 0) {
      return res.status(404).json({ error: 'No files found for this ID' });
    }

    relatedFiles.forEach(f => {
      fs.unlinkSync(path.join(serverConfig.transcriptsDir, f));
    });

    res.json({ success: true, deletedFiles: relatedFiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Redirect root to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// -------------------------------------------------------------
// WebSocket Real-time Broadcast
// -------------------------------------------------------------
function broadcastWs(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to Zoom Local Transcript Companion Server' }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      } else if (data.type === 'ROOM_JOINED') {
        broadcastWs({ type: 'ROOM_JOINED_EVENT', session: data.session });
      } else if (data.type === 'ROOM_LEFT') {
        broadcastWs({ type: 'ROOM_LEFT_EVENT', session: data.session });
      }
    } catch (e) {
      // ignore
    }
  });
});

// -------------------------------------------------------------
// Start Server
// -------------------------------------------------------------
server.listen(PORT, HOST, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Zoom Workplace Auto-Transcript Companion Server Running`);
  console.log(`=============================================================`);
  console.log(`📍 Server Address:     http://${HOST}:${PORT}`);
  console.log(`📁 Transcripts Folder: ${serverConfig.transcriptsDir}`);
  console.log(`💻 In-Meeting App:     http://${HOST}:${PORT}/zoom-app`);
  console.log(`📊 Local Dashboard:    http://${HOST}:${PORT}/dashboard`);
  console.log(`🧪 Meeting Simulator:  http://${HOST}:${PORT}/simulator`);
  console.log(`=============================================================\n`);
});
