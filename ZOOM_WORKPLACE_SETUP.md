# Zoom Workplace (v7.1.5 Windows 11) Setup & Marketplace Guide

This guide walks you through registering and running the **Auto-Transcript Plugin** directly inside the **Zoom Workplace Native Windows Desktop App (v7.1.5 on Windows 11)**.

---

## 🏗️ How It Works

1. **In-Meeting App (WebView2)**: When you join any Zoom meeting in Zoom Workplace on Windows 11, the app automatically initializes through `@zoom/appssdk`.
2. **Auto-Start on Room Entry**:
   - The plugin hooks into `zoomSdk.onMeeting` (action: `'started'`) and context `inMeeting`.
   - It immediately activates continuous voice capture and speech recognition without needing you to click start.
3. **Live Streaming & Utterance Buffering**:
   - Each spoken sentence is timestamped (`[HH:MM:SS]`), tagged with the speaker's name, and streamed to your local companion daemon on `http://127.0.0.1:3000`.
4. **Auto-Save on Room Leave**:
   - When you click "Leave Meeting", or the meeting ends (`onMeeting` action: `'ended'`, `onClose`, window close), the app automatically finalizes the session and saves:
     - **`YYYY-MM-DD_Topic.md`** (Markdown with table summary, stats & dialogue)
     - **`YYYY-MM-DD_Topic.txt`** (Plain text transcript)
     - **`YYYY-MM-DD_Topic.json`** (Full structured data with utterance timestamps)
     - **`YYYY-MM-DD_Topic.vtt`** (WebVTT subtitle format)
   - Directly to your Windows local folder (`./transcripts/` or `%USERPROFILE%\Documents\ZoomTranscripts`).

---

## 🛠️ Zoom App Marketplace Configuration (5 Minutes)

To add this app to your Zoom Workplace client:

### Step 1: Create a Zoom App on Zoom Marketplace
1. Go to the [Zoom App Marketplace](https://marketplace.zoom.us/) and sign in.
2. Click **Develop** (top right) $\to$ **Build App**.
3. Select **Zoom Apps** (In-client apps for Zoom Workplace) $\to$ click **Create**.
4. Set App Name: `Auto-Transcript Taker`.

### Step 2: Basic Information
- **Short Description**: `Automatically transcribes meetings upon entry and saves transcripts locally upon exit.`
- **Company Name**: Your team or company name.
- **Developer Name & Email**: Your email.

### Step 3: Configure Features & Capabilities
Under the **Features** tab:
1. **Zoom App SDK**:
   - Enable the toggle for **In-client App**.
2. **Add SDK Capabilities**:
   Check and add the following required capabilities:
   - `getRunningContext`
   - `getMeetingContext`
   - `getUserContext`
   - `onMeeting`
   - `onClose`
   - `showNotification`
   - `openUrl`
3. **In-Meeting App Configuration**:
   - Check **In-meeting** (Side panel and floating window).
   - Set **Home URL (Development)**: `http://127.0.0.1:3000/zoom-app`
   - Set **Domain Allow List**: Add `127.0.0.1`, `localhost`.

### Step 4: OAuth & Scopes
Under the **Scopes** tab:
- Add `zoomapp:inmeeting` (allows opening and running inside Zoom meetings).

### Step 5: Test in Zoom Workplace (Windows 11)
1. Start your local server:
   ```cmd
   start.bat
   ```
   *(or `npm start`)*
2. In Zoom Marketplace, navigate to **Local Test** tab $\to$ click **Install**.
3. Open **Zoom Workplace v7.1.5 on Windows 11**.
4. Join or start any meeting.
5. In the bottom toolbar, click **Apps** $\to$ **Auto-Transcript Taker**.
6. The app opens in your in-meeting side panel:
   - Status immediately shows **"Listening (Auto-Transcription Active)"**.
   - As you speak, dialogue appears with timestamps.
   - When you click **"Leave Meeting"**, the transcript is automatically saved to your local disk!

---

## 🗂️ Saved File Structure

Every meeting automatically produces 4 files in your local `transcripts/` folder:

```
transcripts/
├── 2026-08-28T15-30-00_Sprint_Planning_MEETING-123.md
├── 2026-08-28T15-30-00_Sprint_Planning_MEETING-123.txt
├── 2026-08-28T15-30-00_Sprint_Planning_MEETING-123.json
└── 2026-08-28T15-30-00_Sprint_Planning_MEETING-123.vtt
```

### Markdown (`.md`) Preview Example:
```markdown
# 📝 Meeting Transcript: Sprint Planning

## ℹ️ Session Overview
| Field | Value |
| :--- | :--- |
| **Topic** | Sprint Planning |
| **Meeting ID** | `849-2039-1192` |
| **Start Time** | 8/28/2026, 3:30:00 PM |
| **Duration** | `00:45:12` |
| **Speakers** | Alex (Host), Sarah, David |
| **Total Words** | 1,420 |

---

## 💬 Full Transcript

### 👤 **Alex (Host)** `[00:00:05]`
> Let's review the sprint deliverables for this release.

### 👤 **Sarah** `[00:00:18]`
> All backend endpoints and transcript exporters are verified.
```

---

## 🔒 Security & Privacy

- **100% Local Storage**: All transcript files are written directly to your local Windows 11 drive. No third-party servers, cloud storage, or external databases are used.
- **OWASP Compliant**: Server enforces strict `Content-Security-Policy`, `Strict-Transport-Security`, and `X-Content-Type-Options` headers mandated by Zoom.
