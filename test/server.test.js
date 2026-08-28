/**
 * Automated Test Suite for Zoom Workplace Auto-Transcript Companion Server
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TEST_PORT = 3005;
const TEST_DIR = path.join(__dirname, 'test_transcripts');

process.env.PORT = TEST_PORT;
process.env.TRANSCRIPTS_DIR = TEST_DIR;
process.env.AUTO_SAVE_FORMATS = 'md,txt,json,vtt';

// Clean test directory
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });

// Require server
require('../server.js');

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const postBody = data ? JSON.stringify(data) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method,
        headers: postBody
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postBody)
            }
          : {}
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : null;
            resolve({ statusCode: res.statusCode, data: parsed, raw: body });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );

    req.on('error', reject);
    if (postBody) req.write(postBody);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Automated Tests for Zoom Workplace Companion...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // Wait 500ms for server to bind
  await new Promise(r => setTimeout(r, 500));

  // Test 1: Health / Status Check
  await test('GET /api/status returns valid system info', async () => {
    const res = await makeRequest('/api/status');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.status, 'online');
    assert.strictEqual(res.data.zoomWorkplaceVersion, '7.1.5');
    assert.strictEqual(res.data.platform, 'Windows 11');
  });

  // Test 2: Stream Ingestion
  await test('POST /api/transcripts/stream accepts real-time chunk', async () => {
    const res = await makeRequest('/api/transcripts/stream', 'POST', {
      meetingId: 'TEST-STREAM-101',
      utterance: {
        speaker: 'You (Host)',
        text: 'Live speaking test in Zoom Workplace.',
        confidence: 0.99,
        timeOffsetSeconds: 3,
        timestamp: new Date().toISOString()
      },
      sessionMetadata: {
        meetingTopic: 'Sprint Review',
        startTime: new Date().toISOString()
      }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.count, 1);
  });

  // Test 3: Auto-Save Full Session on Leave Room
  let savedSessionId = null;
  await test('POST /api/transcripts auto-saves .md, .txt, .json, .vtt files to local disk', async () => {
    const payload = {
      meetingId: 'MEETING-999-888-777',
      meetingTopic: 'Q3 Product Roadmap Review',
      startTime: new Date(Date.now() - 300000).toISOString(),
      endTime: new Date().toISOString(),
      durationSeconds: 300,
      speakers: ['You (Host)', 'Sarah (Product)', 'David (Engineering)'],
      utterances: [
        {
          speaker: 'You (Host)',
          text: 'Welcome everyone to the Q3 roadmap sync.',
          timeOffsetSeconds: 2,
          timestamp: new Date().toISOString()
        },
        {
          speaker: 'Sarah (Product)',
          text: 'The auto-transcript feature for Zoom Workplace on Windows 11 is ready.',
          timeOffsetSeconds: 15,
          timestamp: new Date().toISOString()
        },
        {
          speaker: 'David (Engineering)',
          text: 'It automatically saves files to the local machine when you leave the room.',
          timeOffsetSeconds: 45,
          timestamp: new Date().toISOString()
        }
      ],
      metadata: {
        autoSaved: true,
        savedReason: 'Simulated Room Leave'
      }
    };

    const res = await makeRequest('/api/transcripts', 'POST', payload);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.utteranceCount, 3);
    assert.strictEqual(res.data.savedFiles.length, 4);

    savedSessionId = res.data.id;

    // Verify files on disk
    const files = fs.readdirSync(TEST_DIR);
    const mdFile = files.find(f => f.endsWith('.md'));
    const txtFile = files.find(f => f.endsWith('.txt'));
    const jsonFile = files.find(f => f.endsWith('.json'));
    const vttFile = files.find(f => f.endsWith('.vtt'));

    assert.ok(mdFile, 'Markdown file must exist on disk');
    assert.ok(txtFile, 'Plain text file must exist on disk');
    assert.ok(jsonFile, 'JSON file must exist on disk');
    assert.ok(vttFile, 'WebVTT file must exist on disk');

    const mdContent = fs.readFileSync(path.join(TEST_DIR, mdFile), 'utf8');
    assert.ok(mdContent.includes('Q3 Product Roadmap Review'), 'MD must contain topic');
    assert.ok(mdContent.includes('Sarah (Product)'), 'MD must contain speaker');

    const vttContent = fs.readFileSync(path.join(TEST_DIR, vttFile), 'utf8');
    assert.ok(vttContent.startsWith('WEBVTT'), 'VTT must start with WEBVTT');
  });

  // Test 4: List Transcripts & Search
  await test('GET /api/transcripts lists saved meetings and supports search', async () => {
    const res = await makeRequest('/api/transcripts');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.transcripts.length >= 1);
    assert.strictEqual(res.data.transcripts[0].meetingTopic, 'Q3 Product Roadmap Review');

    // Test Search query
    const searchRes = await makeRequest('/api/transcripts?search=Roadmap');
    assert.strictEqual(searchRes.statusCode, 200);
    assert.strictEqual(searchRes.data.transcripts.length, 1);

    const emptySearchRes = await makeRequest('/api/transcripts?search=NonExistentTerm123');
    assert.strictEqual(emptySearchRes.statusCode, 200);
    assert.strictEqual(emptySearchRes.data.transcripts.length, 0);
  });

  // Test 5: Get Detailed Transcript
  await test('GET /api/transcripts/:id returns complete file contents', async () => {
    const res = await makeRequest(`/api/transcripts/${encodeURIComponent(savedSessionId)}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.meetingTopic, 'Q3 Product Roadmap Review');
    assert.ok(res.data.fileContents.md, 'Must include md content');
    assert.ok(res.data.fileContents.txt, 'Must include txt content');
    assert.ok(res.data.fileContents.vtt, 'Must include vtt content');
  });

  // Test 6: Delete Transcript
  await test('DELETE /api/transcripts/:id removes files from disk', async () => {
    const res = await makeRequest(`/api/transcripts/${encodeURIComponent(savedSessionId)}`, 'DELETE');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    const filesAfter = fs.readdirSync(TEST_DIR);
    assert.strictEqual(filesAfter.length, 0, 'Test folder should be empty after delete');
  });

  console.log(`\n=============================================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`=============================================================\n`);

  // Clean up
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
