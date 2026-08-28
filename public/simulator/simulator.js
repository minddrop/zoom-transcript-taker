/**
 * Zoom Workplace (v7.1.5 Windows 11) Meeting Simulator Controller
 */

(function () {
  'use strict';

  const topics = [
    'Weekly Team Sync & Sprint Review',
    'Product Design Architecture Discussion',
    'Quarterly Strategy & Engineering Alignment',
    'Customer Feedback & Feature Planning'
  ];

  let currentTopicIndex = 0;
  let meetingActive = true;
  let currentSpeaker = 'You (Host)';

  // Elements
  const frame = document.getElementById('zoom-app-frame');
  const dispTopic = document.getElementById('disp-topic');
  const dispId = document.getElementById('disp-id');
  const winTitle = document.getElementById('win-title');

  const simJoin = document.getElementById('sim-join');
  const simLeave = document.getElementById('sim-leave');
  const simNewTopic = document.getElementById('sim-new-topic');
  const btnLeaveMeeting = document.getElementById('btn-leave-meeting');
  const speakerSelect = document.getElementById('sim-speaker-select');

  const btnSpeak1 = document.getElementById('sim-speak-1');
  const btnSpeak2 = document.getElementById('sim-speak-2');
  const btnSpeak3 = document.getElementById('sim-speak-3');
  const customText = document.getElementById('sim-custom-text');
  const btnSendCustom = document.getElementById('sim-btn-send-speech');

  // Speaker participant boxes
  const cardYou = document.getElementById('card-you');
  const cardSarah = document.getElementById('card-sarah');
  const cardDavid = document.getElementById('card-david');

  function updateActiveSpeakerUI(speaker) {
    cardYou.classList.remove('active-speaker');
    cardSarah.classList.remove('active-speaker');
    cardDavid.classList.remove('active-speaker');

    if (speaker.includes('You')) {
      cardYou.classList.add('active-speaker');
    } else if (speaker.includes('Sarah')) {
      cardSarah.classList.add('active-speaker');
    } else if (speaker.includes('David')) {
      cardDavid.classList.add('active-speaker');
    }
  }

  function injectSpeech(text) {
    if (!meetingActive) {
      alert('Meeting is ended. Click "Enter Meeting Room" to start a new session.');
      return;
    }

    const speaker = speakerSelect.value;
    updateActiveSpeakerUI(speaker);

    try {
      if (frame && frame.contentWindow && frame.contentWindow.AutoTranscriptApp) {
        frame.contentWindow.AutoTranscriptApp.addUtterance({
          speaker,
          text,
          confidence: 0.98,
          timeOffsetSeconds: frame.contentWindow.AutoTranscriptApp.state.durationSeconds || 5,
          timestamp: new Date().toISOString()
        });
      } else {
        // Fallback post to server stream
        fetch('/api/transcripts/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: 'SIM-MEETING-101',
            utterance: {
              speaker,
              text,
              confidence: 0.98,
              timeOffsetSeconds: 5,
              timestamp: new Date().toISOString()
            }
          })
        });
      }
    } catch (e) {
      console.warn('Direct frame injection fallback:', e);
    }
  }

  function handleJoinRoom() {
    meetingActive = true;
    const newId = Math.floor(Math.random() * 900 + 100) + ' ' + Math.floor(Math.random() * 9000 + 1000) + ' ' + Math.floor(Math.random() * 9000 + 1000);
    dispId.textContent = 'ID: ' + newId;
    dispTopic.textContent = topics[currentTopicIndex];
    winTitle.textContent = `Zoom Workplace (${topics[currentTopicIndex]})`;

    frame.src = '/zoom-app';
    updateActiveSpeakerUI(speakerSelect.value);
  }

  function handleLeaveRoom() {
    if (!meetingActive) return;
    meetingActive = false;

    try {
      if (frame && frame.contentWindow && frame.contentWindow.AutoTranscriptApp) {
        frame.contentWindow.AutoTranscriptApp.triggerAutoSave('Simulated Room Exit (onMeeting Ended)');
      }
    } catch (e) {
      console.warn('Frame trigger error:', e);
    }

    cardYou.classList.remove('active-speaker');
    cardSarah.classList.remove('active-speaker');
    cardDavid.classList.remove('active-speaker');
    dispTopic.textContent = '[Meeting Ended - Auto-Saved to Local Storage]';
  }

  // Event Listeners
  simJoin.addEventListener('click', handleJoinRoom);
  simLeave.addEventListener('click', handleLeaveRoom);
  btnLeaveMeeting.addEventListener('click', handleLeaveRoom);

  simNewTopic.addEventListener('click', () => {
    currentTopicIndex = (currentTopicIndex + 1) % topics.length;
    handleJoinRoom();
  });

  speakerSelect.addEventListener('change', (e) => {
    currentSpeaker = e.target.value;
    updateActiveSpeakerUI(currentSpeaker);
  });

  btnSpeak1.addEventListener('click', () => injectSpeech("Let's review the sprint objectives and ensure all tasks are on track."));
  btnSpeak2.addEventListener('click', () => injectSpeech("All automated tests passed for the Zoom Workplace auto-transcript plugin!"));
  btnSpeak3.addEventListener('click', () => injectSpeech("Thanks everyone. I'm leaving the room now, which will auto-save our transcript."));

  btnSendCustom.addEventListener('click', () => {
    const txt = customText.value.trim();
    if (txt) {
      injectSpeech(txt);
      customText.value = '';
    }
  });

  customText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnSendCustom.click();
    }
  });

  // Start with speaker selected
  updateActiveSpeakerUI(speakerSelect.value);
})();
