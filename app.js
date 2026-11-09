/**
 * AI English Speaking Coach - Frontend Controller
 */

// State Management
const state = {
  isListening: false,
  isCoachSpeaking: false,
  isProcessing: false,
  continuousMode: true,
  history: [], // [{ role: 'user' | 'model', text: '...' }]
  availableVoices: [],
  selectedVoice: null,
  rate: 1.0,
  pitch: 1.0,
  model: 'gemini-3.5-flash',
  scenario: 'casual',
  apiKey: localStorage.getItem('gemini_coach_key') || '',
  silenceDelay: parseFloat(localStorage.getItem('gemini_coach_silence') || '2800'),
  correctionsCount: 0,
  totalWordsSpoken: 0,
  turnsCount: 0,
  silenceTimer: null,
  recognition: null
};

// DOM References
const orbCanvas = document.getElementById('orbCanvas');
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const liveSubtitle = document.getElementById('liveSubtitle');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const sendNowBtn = document.getElementById('sendNowBtn');
const orbCenterBtn = document.getElementById('orbCenterBtn');
const micBtnLabel = document.getElementById('micBtnLabel');
const interruptBtn = document.getElementById('interruptBtn');
const continuousModeToggle = document.getElementById('continuousMode');
const scenarioSelect = document.getElementById('scenarioSelect');
const textInput = document.getElementById('textInput');
const sendTextBtn = document.getElementById('sendTextBtn');

// Tabs & Panels
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const latestCorrectionContainer = document.getElementById('latestCorrectionContainer');
const correctionCountBadge = document.getElementById('correctionCountBadge');
const turnCountEl = document.getElementById('turnCount');
const wordCountEl = document.getElementById('wordCount');
const correctionsTotalEl = document.getElementById('correctionsTotal');
const transcriptFeed = document.getElementById('transcriptFeed');
const clearChatBtn = document.getElementById('clearChatBtn');
const exportChatBtn = document.getElementById('exportChatBtn');

// Modals
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');
const voiceSelect = document.getElementById('voiceSelect');
const testVoiceBtn = document.getElementById('testVoiceBtn');
const rateRange = document.getElementById('rateRange');
const rateVal = document.getElementById('rateVal');
const pitchRange = document.getElementById('pitchRange');
const pitchVal = document.getElementById('pitchVal');
const silenceRange = document.getElementById('silenceRange');
const silenceVal = document.getElementById('silenceVal');

const summaryBtn = document.getElementById('summaryBtn');
const summaryModal = document.getElementById('summaryModal');
const closeSummaryBtn = document.getElementById('closeSummaryBtn');
const dismissSummaryBtn = document.getElementById('dismissSummaryBtn');
const copySummaryBtn = document.getElementById('copySummaryBtn');
const summaryContent = document.getElementById('summaryContent');

// Initialize Voice Orb
const orb = new window.VoiceOrb('orbCanvas');

// -------------------------------------------------------------
// Speech Recognition (STT) Setup
// -------------------------------------------------------------
let currentSpokenText = '';
let previousRecognizedChunks = '';

function commitAndSend() {
  clearTimeout(state.silenceTimer);
  const textToSend = currentSpokenText.trim();
  if (textToSend.length > 0 && !state.isProcessing && !state.isCoachSpeaking) {
    currentSpokenText = '';
    previousRecognizedChunks = '';
    if (sendNowBtn) sendNowBtn.style.display = 'none';
    sendMessage(textToSend);
  }
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setStatus('Speech Recognition not supported in this browser. Please use Chrome/Edge.', 'idle');
    liveSubtitle.textContent = 'Speech recognition not available. You can type using the text box below.';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    state.isListening = true;
    updateMicButtonUI();
    setStatus('Listening... speak naturally', 'listening');
    orb.setState('listening');
  };

  recognition.onresult = (event) => {
    let finalChunk = '';
    let interimChunk = '';

    // Loop through ALL items from index 0 so long sentences are NEVER cut in half!
    for (let i = 0; i < event.results.length; ++i) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalChunk += piece + ' ';
      } else {
        interimChunk += piece;
      }
    }

    const fullUtterance = [previousRecognizedChunks, finalChunk, interimChunk]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (fullUtterance) {
      liveSubtitle.textContent = `"${fullUtterance}"`;
      liveSubtitle.className = 'live-subtitle active-user';
      currentSpokenText = fullUtterance;

      if (sendNowBtn) {
        sendNowBtn.style.display = 'inline-flex';
      }

      // Simulate audio reactive level for Orb
      orb.setAudioLevel(0.4 + Math.random() * 0.5);

      // Auto-submit after natural speech pause (customizable silence delay)
      clearTimeout(state.silenceTimer);
      state.silenceTimer = setTimeout(() => {
        commitAndSend();
      }, state.silenceDelay || 2800);
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    if (event.error === 'not-allowed') {
      setStatus('Microphone access blocked. Please enable mic permissions.', 'idle');
      stopListening();
    }
  };

  recognition.onend = () => {
    // If the browser ends recognition while speech was in progress,
    // preserve what was spoken so far so it doesn't get wiped upon restart!
    if (currentSpokenText && !state.isProcessing && !state.isCoachSpeaking) {
      previousRecognizedChunks = currentSpokenText;
    }
    state.isListening = false;
    updateMicButtonUI();
    // In continuous mode, restart listening if coach is not speaking or processing
    if (state.continuousMode && !state.isCoachSpeaking && !state.isProcessing) {
      try {
        recognition.start();
      } catch (e) {
        // Ignored
      }
    } else if (!state.isCoachSpeaking && !state.isProcessing) {
      setStatus('Ready to practice', 'idle');
      orb.setState('idle');
    }
  };

  state.recognition = recognition;
}

function startListening() {
  if (state.isCoachSpeaking) {
    stopCoachSpeaking();
  }

  if (state.recognition && !state.isListening) {
    try {
      state.recognition.start();
    } catch (e) {
      console.warn('Recognition start caught:', e);
    }
  }
}

function stopListening() {
  clearTimeout(state.silenceTimer);
  if (state.recognition && state.isListening) {
    try {
      state.recognition.stop();
    } catch (e) {
      console.warn('Recognition stop caught:', e);
    }
  }
  state.isListening = false;
  updateMicButtonUI();
}

function updateMicButtonUI() {
  if (state.isListening) {
    toggleMicBtn.classList.add('recording');
    orbCenterBtn.style.borderColor = 'var(--accent-emerald)';
    orbCenterBtn.style.color = '#34d399';
    micBtnLabel.textContent = 'Listening (Click to Pause)';
  } else {
    toggleMicBtn.classList.remove('recording');
    orbCenterBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    orbCenterBtn.style.color = 'var(--text-main)';
    micBtnLabel.textContent = 'Start Speaking';
  }
}

// -------------------------------------------------------------
// Text to Speech (TTS) Setup
// -------------------------------------------------------------
function loadVoices() {
  if (!('speechSynthesis' in window)) return;

  function populate() {
    const allVoices = window.speechSynthesis.getVoices();
    // Prioritize natural English voices
    const englishVoices = allVoices.filter(v => v.lang.startsWith('en'));
    state.availableVoices = englishVoices.length ? englishVoices : allVoices;

    voiceSelect.innerHTML = '';
    state.availableVoices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' — Default' : ''}`;
      // Auto select Google US English, Samantha, Daniel or first US English voice
      if (
        voice.name.includes('Google US English') ||
        voice.name.includes('Natural') ||
        voice.name.includes('Samantha') ||
        voice.name.includes('Daniel')
      ) {
        option.selected = true;
        state.selectedVoice = voice;
      }
      voiceSelect.appendChild(option);
    });

    if (!state.selectedVoice && state.availableVoices.length) {
      state.selectedVoice = state.availableVoices[0];
    }
  }

  populate();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populate;
  }
}

function speakText(text, onComplete) {
  if (!('speechSynthesis' in window) || !text) {
    if (onComplete) onComplete();
    return;
  }

  // Stop any active recognition while coach is speaking to prevent echo feedback
  if (state.isListening) {
    stopListening();
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  if (state.selectedVoice) {
    utterance.voice = state.selectedVoice;
  }
  utterance.rate = state.rate;
  utterance.pitch = state.pitch;

  utterance.onstart = () => {
    state.isCoachSpeaking = true;
    setStatus('Coach is speaking...', 'speaking');
    orb.setState('speaking');
    orb.setAudioLevel(0.7);

    liveSubtitle.textContent = `"${text}"`;
    liveSubtitle.className = 'live-subtitle active-coach';
  };

  utterance.onend = () => {
    state.isCoachSpeaking = false;
    orb.setAudioLevel(0);

    if (onComplete) onComplete();

    // If continuous mode, automatically resume listening for student's reply!
    if (state.continuousMode) {
      setTimeout(() => {
        startListening();
      }, 150);
    } else {
      setStatus('Ready to practice', 'idle');
      orb.setState('idle');
    }
  };

  utterance.onerror = (e) => {
    console.warn('TTS error:', e);
    state.isCoachSpeaking = false;
    if (onComplete) onComplete();
  };

  window.speechSynthesis.speak(utterance);
}

function stopCoachSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  state.isCoachSpeaking = false;
  orb.setAudioLevel(0);
}

// -------------------------------------------------------------
// Message Sending & Gemini API Integration
// -------------------------------------------------------------
const STANDALONE_SYSTEM_PROMPT = `You are my personal AI English Speaking Coach, conversation partner, and communication trainer.

1. Your Identity
Your primary purpose is to help me improve my spoken English, fluency, confidence, vocabulary, pronunciation, grammar, and overall communication skills through natural, interactive voice conversations.
You should feel like a friendly, intelligent, patient, and supportive human conversation partner — not a robot, textbook, or strict English teacher.

2. Language Rules
- Speak with me in English at all times.
- Use natural, modern, everyday English.
- Adjust your vocabulary, sentence complexity, and speaking pace to my current English level.
- Start with simple, clear English and gradually introduce more advanced expressions as I improve.
- Use a natural conversational tone, with contractions and common expressions where appropriate.
- Do not switch to another language unless I explicitly ask you to explain something in my native language.

3. Your Main Goal
Your main goal is to make me a confident and effective English communicator.
Help me learn how to:
- Speak English fluently without translating every sentence in my head.
- Express my thoughts, feelings, opinions, and ideas clearly.
- Think in English and respond more naturally.
- Build sentences quickly without getting stuck.
- Use the right vocabulary and expressions in different situations.
- Speak confidently in meetings, interviews, presentations, and social conversations.
- Improve pronunciation, grammar, sentence structure, and clarity.
- Develop better storytelling, listening, and interpersonal communication skills.
- Reduce hesitation, unnecessary filler words, and repetitive expressions.

4. How You Should Talk to Me
Follow a natural, two-way conversation style:
- Ask me ONE question at a time. Never ask multiple questions in a single response.
- Listen carefully to what I say and respond to the meaning of my message.
- Ask follow-up questions based on my answers to keep the conversation flowing.
- Share your own thoughts, opinions, examples, and perspectives when appropriate.
- Do not make every conversation feel like an interview.
- Do not interrupt or correct me after every sentence.
- Avoid long monologues. Keep most responses concise, natural, and conversational (1 to 3 short sentences plus your single question), ideal for voice conversation.
- Encourage me to speak more than you do.
- If my answer is too short, ask a friendly follow-up question that helps me elaborate.

5. How to Correct My English
Help me improve without making me nervous or embarrassed.
When I make a mistake, decide whether it is important to correct immediately or whether it is better to let the conversation continue.
Focus on:
- Grammar mistakes.
- Incorrect sentence structure.
- Unnatural word choices.
- Incorrect use of vocabulary or expressions.
- Unclear, confusing, or overly complicated ways of expressing an idea.

When a correction is useful, use this clean format:
[CORRECTION]
What you said: <repeat the incorrect phrase>
A more natural version: <corrected sentence>
Why: <brief explanation in simple English>
Try again: <prompt me to repeat or use it>
[/CORRECTION]

After the correction (or if no correction is needed), continue the natural voice conversation and end with your ONE friendly follow-up question.
Do not correct every minor slip. Prioritize errors that affect clarity or sound very unnatural. If I speak correctly but unnaturally, show me how a native speaker would say it.

6. Teach Me Natural English in Context
Introduce everyday expressions, phrasal verbs, collocations, and polite ways to disagree in context rather than long lists. Explain briefly with a natural example.

7. Real-Life Role-Play & Practice Modes
When a role-play or scenario is active, stay fully in character while maintaining your warm coaching instincts.

8. Voice Conversation Rules
- Use short, spoken phrasing that sounds great when read by text-to-speech.
- Keep responses compact so I have maximum time to speak.
- End with exactly one clear, engaging question.
`;

function parseCorrectionClient(text) {
  const correctionRegex = /\[CORRECTION\]([\s\S]*?)\[\/CORRECTION\]/i;
  const match = text.match(correctionRegex);

  let correction = null;
  let cleanSpeechText = text;

  if (match) {
    const rawBlock = match[1].trim();
    cleanSpeechText = text.replace(correctionRegex, '').trim();

    const saidMatch = rawBlock.match(/What (?:you|I) said:\s*(.*)/i);
    const naturalMatch = rawBlock.match(/A more natural version:\s*(.*)/i);
    const whyMatch = rawBlock.match(/Why:\s*(.*)/i);
    const tryMatch = rawBlock.match(/Try again:\s*(.*)/i);

    correction = {
      said: saidMatch ? saidMatch[1].trim() : '',
      natural: naturalMatch ? naturalMatch[1].trim() : '',
      why: whyMatch ? whyMatch[1].trim() : '',
      tryAgain: tryMatch ? tryMatch[1].trim() : ''
    };
  }

  return { cleanSpeechText, correction };
}

async function callGeminiDirectly(userText) {
  const apiKey = state.apiKey;
  if (!apiKey) {
    throw new Error('Gemini API Key is required. Please tap Settings (⚙️) to enter your API key.');
  }

  const model = state.model || 'gemini-3.5-flash';
  let scenarioNote = '';
  if (state.scenario && state.scenario !== 'casual') {
    scenarioNote = `\n\n[Active Practice Scenario: ${state.scenario}. Stay in character for this scenario while keeping your friendly coaching identity.]`;
  }
  const fullSystemPrompt = STANDALONE_SYSTEM_PROMPT + scenarioNote;

  const contents = [];
  for (const turn of state.history) {
    if (turn.role === 'user' || turn.role === 'model') {
      contents.push({
        role: turn.role,
        parts: [{ text: turn.text }]
      });
    }
  }
  contents.push({
    role: 'user',
    parts: [{ text: userText }]
  });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: fullSystemPrompt }] },
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 600
      }
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Gemini status ${response.status}`);
  }

  const data = await response.json();
  const replyText = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  const { cleanSpeechText, correction } = parseCorrectionClient(replyText);

  return { reply: replyText, cleanSpeechText, correction, modelUsed: model };
}

async function sendMessage(userText) {
  if (!userText || state.isProcessing) return;

  currentSpokenText = '';
  previousRecognizedChunks = '';
  clearTimeout(state.silenceTimer);
  if (sendNowBtn) sendNowBtn.style.display = 'none';

  state.isProcessing = true;
  stopListening();

  // Metrics update
  state.turnsCount += 1;
  turnCountEl.textContent = state.turnsCount;
  const wordCount = userText.trim().split(/\s+/).length;
  state.totalWordsSpoken += wordCount;
  wordCountEl.textContent = state.totalWordsSpoken;

  // Render user message to transcript
  appendChatMessage('user', userText);

  setStatus('Coach is thinking...', 'thinking');
  orb.setState('thinking');
  liveSubtitle.textContent = 'Processing your response...';
  liveSubtitle.className = 'live-subtitle';

  try {
    let data;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: state.history,
          clientApiKey: state.apiKey,
          model: state.model,
          scenario: state.scenario
        })
      });

      if (response.ok) {
        data = await response.json();
      } else if (response.status === 404) {
        // Fallback for static hosting like GitHub Pages
        data = await callGeminiDirectly(userText);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server status ${response.status}`);
      }
    } catch (fetchErr) {
      if (fetchErr.name === 'TypeError' || fetchErr.message.includes('fetch')) {
        // Network/static host fallback (GitHub Pages)
        data = await callGeminiDirectly(userText);
      } else {
        throw fetchErr;
      }
    }

    // Save to conversation history
    state.history.push({ role: 'user', text: userText });
    state.history.push({ role: 'model', text: data.reply });

    // Render coach response to transcript
    appendChatMessage('coach', data.reply);

    // Handle correction feedback card
    if (data.correction && data.correction.said) {
      renderCorrectionCard(data.correction);
      state.correctionsCount += 1;
      correctionCountBadge.textContent = state.correctionsCount;
      correctionsTotalEl.textContent = state.correctionsCount;
    }

    // Speak the clean spoken text
    speakText(data.cleanSpeechText || data.reply);

  } catch (error) {
    console.error('Chat error:', error);
    setStatus(`Error: ${error.message}`, 'idle');
    orb.setState('idle');
    liveSubtitle.textContent = `Error: ${error.message}. Please check your API key in Settings.`;

    // Prompt user to open settings if missing API key
    if (error.message.includes('API Key') || !state.apiKey) {
      settingsModal.classList.add('open');
    }
  } finally {
    state.isProcessing = false;
  }
}

// -------------------------------------------------------------
// UI Helpers
// -------------------------------------------------------------
function setStatus(text, statusClass) {
  statusText.textContent = text;
  statusPill.className = `status-pill ${statusClass}`;
}

function appendChatMessage(role, text) {
  const msgEl = document.createElement('div');
  msgEl.className = `chat-message ${role}`;

  const metaEl = document.createElement('div');
  metaEl.className = 'message-meta';
  metaEl.textContent = role === 'user' ? 'You' : 'Coach';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'message-body';
  // Strip raw [CORRECTION] tags for clean transcript view
  const cleanDisplay = text.replace(/\[CORRECTION\][\s\S]*?\[\/CORRECTION\]/i, '').trim();
  bodyEl.textContent = cleanDisplay || text;

  msgEl.appendChild(metaEl);
  msgEl.appendChild(bodyEl);
  transcriptFeed.appendChild(msgEl);

  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

function renderCorrectionCard(c) {
  latestCorrectionContainer.className = 'correction-card active-note';
  latestCorrectionContainer.innerHTML = `
    <div class="correction-item">
      <div class="correction-label label-said">What you said</div>
      <div class="correction-text">"${escapeHtml(c.said)}"</div>
    </div>
    <div class="correction-item">
      <div class="correction-label label-natural">A more natural version</div>
      <div class="correction-text improved">"${escapeHtml(c.natural)}"</div>
    </div>
    <div class="correction-item">
      <div class="correction-label label-why">Why</div>
      <div class="correction-text">${escapeHtml(c.why)}</div>
    </div>
    ${c.tryAgain ? `
    <div class="correction-item">
      <div class="correction-label label-natural">Practice</div>
      <div class="correction-text">${escapeHtml(c.tryAgain)}</div>
    </div>` : ''}
    <button class="btn btn-secondary btn-small repeat-btn" id="listenPronounceBtn">
      🔊 Listen to Correct Sentence
    </button>
  `;

  document.getElementById('listenPronounceBtn')?.addEventListener('click', () => {
    speakText(c.natural);
  });

  // Switch to feedback tab automatically to celebrate learning
  activateTab('feedback');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function activateTab(tabName) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  tabPanes.forEach(pane => {
    pane.classList.toggle('active', pane.id === `${tabName}Tab`);
  });
}

async function generateSummaryDirectly() {
  const apiKey = state.apiKey;
  if (!apiKey) throw new Error('Gemini API Key required in Settings.');
  const model = state.model || 'gemini-3.5-flash';
  const transcriptText = state.history
    .map(t => `${t.role === 'user' ? 'Student' : 'Coach'}: ${t.text}`)
    .join('\n');

  const prompt = `Review this English coaching conversation transcript between a student and their coach:

${transcriptText}

Provide a short, constructive, and motivating session feedback summary in this JSON format:
{
  "strengths": ["string", "string"],
  "improvements": ["string", "string"],
  "usefulExpressionsLearned": ["string", "string"],
  "nextGoal": "string"
}
Only output valid JSON.`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to generate summary');
  }

  const data = await response.json();
  const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(jsonStr);
}

// -------------------------------------------------------------
// Session Feedback Summary
// -------------------------------------------------------------
async function openSessionSummary() {
  summaryModal.classList.add('open');
  summaryContent.innerHTML = '<div class="loading-spinner">Analyzing your practice session with Gemini...</div>';

  try {
    let data;
    try {
      const res = await fetch('/api/session-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: state.history,
          clientApiKey: state.apiKey,
          model: state.model
        })
      });

      if (res.ok) {
        data = await res.json();
      } else {
        data = await generateSummaryDirectly();
      }
    } catch (fetchErr) {
      data = await generateSummaryDirectly();
    }

    if (data.error) throw new Error(data.error);

    let html = '';
    if (data.strengths?.length) {
      html += `<div class="summary-section">
        <h4>🌟 What You Did Well</h4>
        <ul class="summary-list">
          ${data.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (data.improvements?.length) {
      html += `<div class="summary-section">
        <h4>🎯 Key Areas to Refine</h4>
        <ul class="summary-list">
          ${data.improvements.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (data.usefulExpressionsLearned?.length) {
      html += `<div class="summary-section">
        <h4>💬 Useful Expressions Practiced</h4>
        <ul class="summary-list">
          ${data.usefulExpressionsLearned.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (data.nextGoal) {
      html += `<div class="summary-challenge">
        <h4>🚀 Practice Goal for Tomorrow</h4>
        <p>${escapeHtml(data.nextGoal)}</p>
      </div>`;
    }

    summaryContent.innerHTML = html || '<p>Keep practicing to build your session history!</p>';

  } catch (err) {
    summaryContent.innerHTML = `<p style="color: var(--accent-rose);">Could not generate summary: ${err.message}</p>`;
  }
}

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------
function setupEventListeners() {
  // Mic toggle buttons
  const handleMicToggle = () => {
    if (state.isListening) {
      stopListening();
      setStatus('Paused listening', 'idle');
      orb.setState('idle');
    } else {
      startListening();
    }
  };

  toggleMicBtn.addEventListener('click', handleMicToggle);
  orbCenterBtn.addEventListener('click', handleMicToggle);

  // Send Now button (bypasses silence timer)
  if (sendNowBtn) {
    sendNowBtn.addEventListener('click', () => {
      commitAndSend();
    });
  }

  // Interrupt button
  interruptBtn.addEventListener('click', () => {
    stopCoachSpeaking();
    setStatus('Audio stopped', 'idle');
    orb.setState('idle');
  });

  // Continuous mode toggle
  continuousModeToggle.addEventListener('change', (e) => {
    state.continuousMode = e.target.checked;
  });

  // Scenario change
  scenarioSelect.addEventListener('change', (e) => {
    state.scenario = e.target.value;
    const scenarioName = e.target.options[e.target.selectedIndex].text;
    appendChatMessage('coach', `[Switched practice scenario to: ${scenarioName}]. Let's continue!`);
  });

  // Text send
  const handleTextSend = () => {
    const text = textInput.value.trim();
    if (text) {
      textInput.value = '';
      sendMessage(text);
    }
  };

  sendTextBtn.addEventListener('click', handleTextSend);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleTextSend();
  });

  // Spacebar push-to-talk / toggle (when not typing in an input)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      handleMicToggle();
    }
  });

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab);
    });
  });

  // Clear chat
  clearChatBtn.addEventListener('click', () => {
    if (confirm('Clear the conversation history?')) {
      state.history = [];
      transcriptFeed.innerHTML = `
        <div class="chat-message coach initial-message">
          <div class="message-meta">Coach • Just now</div>
          <div class="message-body">
            Fresh start! What would you like to talk about or practice today?
          </div>
        </div>
      `;
      state.turnsCount = 0;
      state.totalWordsSpoken = 0;
      turnCountEl.textContent = '0';
      wordCountEl.textContent = '0';
    }
  });

  // Export transcript
  exportChatBtn.addEventListener('click', () => {
    const transcriptText = state.history
      .map(t => `${t.role === 'user' ? 'Student' : 'Coach'}: ${t.text}`)
      .join('\n\n');

    navigator.clipboard.writeText(transcriptText).then(() => {
      exportChatBtn.textContent = '✓ Copied!';
      setTimeout(() => { exportChatBtn.textContent = 'Copy Transcript'; }, 2000);
    });
  });

  // Settings Modal
  settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = state.apiKey;
    modelSelect.value = state.model;
    rateRange.value = state.rate;
    rateVal.textContent = `${state.rate}x`;
    pitchRange.value = state.pitch;
    pitchVal.textContent = `${state.pitch}`;
    if (silenceRange && silenceVal) {
      const sec = (state.silenceDelay / 1000).toFixed(2);
      silenceRange.value = sec;
      silenceVal.textContent = `${sec}s`;
    }
    settingsModal.classList.add('open');
  });

  closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('open'));

  if (silenceRange && silenceVal) {
    silenceRange.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      silenceVal.textContent = `${val.toFixed(2)}s`;
      state.silenceDelay = val * 1000;
    });
  }

  rateRange.addEventListener('input', (e) => {
    state.rate = parseFloat(e.target.value);
    rateVal.textContent = `${state.rate}x`;
  });

  pitchRange.addEventListener('input', (e) => {
    state.pitch = parseFloat(e.target.value);
    pitchVal.textContent = `${state.pitch}`;
  });

  voiceSelect.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && state.availableVoices[idx]) {
      state.selectedVoice = state.availableVoices[idx];
    }
  });

  testVoiceBtn.addEventListener('click', () => {
    speakText('Hello! This is how your English coach will sound during our conversations.');
  });

  saveSettingsBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    state.apiKey = key;
    localStorage.setItem('gemini_coach_key', key);
    localStorage.setItem('gemini_coach_silence', state.silenceDelay.toString());
    state.model = modelSelect.value;
    settingsModal.classList.remove('open');
    setStatus('Settings saved!', 'idle');
  });

  // Summary Modal
  summaryBtn.addEventListener('click', openSessionSummary);
  closeSummaryBtn.addEventListener('click', () => summaryModal.classList.remove('open'));
  dismissSummaryBtn.addEventListener('click', () => summaryModal.classList.remove('open'));

  copySummaryBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(summaryContent.innerText).then(() => {
      copySummaryBtn.textContent = '✓ Copied!';
      setTimeout(() => { copySummaryBtn.textContent = 'Copy Summary'; }, 2000);
    });
  });

  // Close modals on backdrop click
  [settingsModal, summaryModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
async function init() {
  setupSpeechRecognition();
  loadVoices();
  setupEventListeners();

  // Check server configuration
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    if (config.hasServerKey) {
      console.log('Server Gemini API key detected.');
    } else if (!state.apiKey) {
      console.log('No server API key found. User can provide client key in Settings.');
    }
    if (config.defaultModel) {
      state.model = config.defaultModel;
    }
  } catch (err) {
    console.warn('Could not reach /api/config', err);
  }
}

window.addEventListener('DOMContentLoaded', init);
