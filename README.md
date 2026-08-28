# 🎙️ Zoom Workplace Auto-Transcript Plugin & Local Storage Suite

> **Built for Zoom Workplace (v7.1.5 Native Windows App) on Windows 11**  
> Automatically starts live speech-to-text transcription when entering a meeting room and automatically writes the full transcript to your local filesystem upon leaving.

---

## ✨ Features

- **⚡ Zero-Click Room Entry**: Hooks into `@zoom/appssdk` (`onMeeting`, `getRunningContext`) and immediately starts transcription as soon as you enter a Zoom meeting.
- **💾 Automatic Local Save on Exit**: When you leave the room or the meeting ends, automatically generates and writes 4 local file formats to `./transcripts/`:
  - **Markdown (`.md`)**: Formatted meeting notes with metadata table, participant summary, word count, and speaker dialogue.
  - **Plain Text (`.txt`)**: Clean timestamped dialogue log `[HH:MM:SS] Speaker: text`.
  - **JSON (`.json`)**: Full structured session data with confidence scores and speaker timestamps.
  - **WebVTT (`.vtt`)**: Subtitle format compatible with video editors and media players.
- **🛡️ 100% Local & Private**: Everything stays on your local machine (`http://127.0.0.1:3000`). No cloud recording or external subscriptions required.
- **📊 Local Transcript Dashboard**: Modern dark-mode web interface to browse past meetings, search across dialogue text, filter by speaker, and export.
- **🧪 In-Browser Zoom Workplace Simulator**: Complete test bench to simulate joining meetings, injecting dialogue, and verifying auto-save without needing a live Zoom meeting.
- **🚀 Windows 11 Launchers**: One-click start with `start.bat` or `start.ps1`.

---

## 🚀 Quick Start (Windows 11)

### Option 1: One-Click Windows Launcher
Double-click **`start.bat`** (or right-click `start.ps1` $\to$ **Run with PowerShell**).

### Option 2: Manual Terminal Startup
```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite
npm test

# 3. Start companion server
npm start
```

Once running:
- **📊 Dashboard**: [http://127.0.0.1:3000/dashboard](http://127.0.0.1:3000/dashboard)
- **🧪 Meeting Simulator**: [http://127.0.0.1:3000/simulator](http://127.0.0.1:3000/simulator)
- **🎙️ In-Meeting Zoom App**: [http://127.0.0.1:3000/zoom-app](http://127.0.0.1:3000/zoom-app)

---

## 🧪 Testing with the In-Browser Simulator

You can test the entire workflow right now without opening Zoom:
1. Start the server (`npm start`).
2. Open **[http://127.0.0.1:3000/simulator](http://127.0.0.1:3000/simulator)**.
3. Click **"Enter Meeting Room"** $\to$ Notice the side panel starts transcribing automatically.
4. Click simulation speech buttons or speak into your microphone $\to$ Utterances appear with timestamps and speaker tags.
5. Click **"Leave Room"** $\to$ The complete session is automatically saved to `./transcripts/` in `.md`, `.txt`, `.json`, and `.vtt`.
6. Open **[http://127.0.0.1:3000/dashboard](http://127.0.0.1:3000/dashboard)** to search, view, and download the saved transcript files!

---

## ⚙️ Configuration & Custom Save Folder

Edit `.env` or use the **Settings** tab in the Dashboard:

```ini
# Server Port & Host
PORT=3000
HOST=127.0.0.1

# Custom Windows 11 Save Folder (e.g. your Documents folder)
TRANSCRIPTS_DIR=./transcripts
# Or: TRANSCRIPTS_DIR=C:\Users\YourUsername\Documents\ZoomTranscripts

# Formats to generate on auto-save
AUTO_SAVE_FORMATS=md,txt,json,vtt

# Default recognition language
DEFAULT_LANGUAGE=en-US
```

---

## 📖 Integrating with Zoom Workplace Client

See **[ZOOM_WORKPLACE_SETUP.md](./ZOOM_WORKPLACE_SETUP.md)** for the step-by-step Zoom Marketplace setup guide.

---

## 📂 Project Structure

```
zoom-transcript-taker/
├── server.js                  # Express + WebSocket server & local auto-save engine
├── package.json               # Dependencies and scripts
├── .env.example               # Configuration template
├── start.bat                  # Windows 11 one-click batch launcher
├── start.ps1                  # Windows 11 PowerShell launcher
├── transcripts/               # Auto-saved local transcripts directory
├── public/
│   ├── zoom-app/              # In-meeting Zoom App (WebView2)
│   │   ├── index.html
│   │   ├── app.js             # @zoom/appssdk & continuous speech capture
│   │   └── styles.css
│   ├── dashboard/             # Management dashboard & transcript explorer
│   │   ├── index.html
│   │   ├── dashboard.js
│   │   └── styles.css
│   └── simulator/             # Interactive Zoom Workplace meeting simulator
│       ├── index.html
│       ├── simulator.js
│       └── styles.css
├── src/
│   └── windows-watcher.js     # Windows 11 Zoom.exe process companion
├── test/
│   └── server.test.js         # Automated test suite
├── README.md                  # Main documentation
└── ZOOM_WORKPLACE_SETUP.md    # Zoom Marketplace configuration guide
```
