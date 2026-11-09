const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { COACH_SYSTEM_PROMPT } = require('./coach_prompt');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration status endpoint
app.get('/api/config', (req, res) => {
  res.json({
    hasServerKey: Boolean(process.env.GEMINI_API_KEY),
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-3.5-flash'
  });
});

// Helper to query Gemini with automatic resilience & model fallback
async function callGeminiWithFallback(preferredModel, apiKey, payload) {
  // Ordered fallback models
  const candidateModels = [
    preferredModel,
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
    'gemini-3.8-flash'
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;

  for (const model of candidateModels) {
    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        return { data, modelUsed: model };
      }

      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `Gemini API status ${response.status}`;
      console.warn(`[Gemini] Model ${model} returned error: ${errorMsg}. Trying next candidate...`);
      lastError = errorMsg;
    } catch (err) {
      console.warn(`[Gemini] Model ${model} fetch exception: ${err.message}. Trying next candidate...`);
      lastError = err.message;
    }
  }

  throw new Error(lastError || 'All model candidates failed to respond.');
}

// Chat endpoint communicating with Gemini API
app.post('/api/chat', async (req, res) => {
  try {
    let { message, history = [], clientApiKey, model = 'gemini-3.5-flash', scenario = 'casual' } = req.body;
    
    // Remap deprecated models if passed from cached clients
    if (model === 'gemini-2.5-flash' || model === 'gemini-1.5-flash' || model === 'gemini-2.0-flash') {
      model = 'gemini-3.5-flash';
    }

    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'Gemini API Key is required. Please set it in Settings or in your .env file.'
      });
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    // Build scenario context if active
    let scenarioNote = '';
    if (scenario && scenario !== 'casual') {
      scenarioNote = `\n\n[Active Practice Scenario: ${scenario}. Stay in character for this scenario while keeping your friendly coaching identity.]`;
    }

    const fullSystemPrompt = COACH_SYSTEM_PROMPT + scenarioNote;

    // Convert history into Gemini contents format
    const contents = [];
    for (const turn of history) {
      if (turn.role === 'user' || turn.role === 'model') {
        contents.push({
          role: turn.role,
          parts: [{ text: turn.text }]
        });
      }
    }

    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const geminiPayload = {
      systemInstruction: {
        parts: [{ text: fullSystemPrompt }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 600
      }
    };

    const { data, modelUsed } = await callGeminiWithFallback(model, apiKey, geminiPayload);
    const candidate = data.candidates?.[0];
    const replyText = candidate?.content?.parts?.map(p => p.text).join('') || '';

    // Parse out any [CORRECTION] blocks for clean UI presentation & clean TTS reading
    const { cleanSpeechText, correction } = parseCorrection(replyText);

    res.json({
      reply: replyText,
      cleanSpeechText,
      correction,
      modelUsed
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Helper to separate correction metadata from voice speech
function parseCorrection(text) {
  const correctionRegex = /\[CORRECTION\]([\s\S]*?)\[\/CORRECTION\]/i;
  const match = text.match(correctionRegex);

  let correction = null;
  let cleanSpeechText = text;

  if (match) {
    const rawBlock = match[1].trim();
    // Strip [CORRECTION]...[/CORRECTION] from the speech text so TTS speaks naturally
    cleanSpeechText = text.replace(correctionRegex, '').trim();

    // Extract fields
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

// Session Feedback Summary
app.post('/api/session-summary', async (req, res) => {
  try {
    let { history = [], clientApiKey, model = 'gemini-3.5-flash' } = req.body;
    if (model === 'gemini-2.5-flash' || model === 'gemini-1.5-flash' || model === 'gemini-2.0-flash') {
      model = 'gemini-3.5-flash';
    }
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API Key required' });
    }

    if (!history.length) {
      return res.json({ summary: 'No conversation turns recorded yet to summarize.' });
    }

    const conversationTranscript = history
      .map(t => `${t.role === 'user' ? 'Student' : 'Coach'}: ${t.text}`)
      .join('\n');

    const prompt = `Review this English coaching conversation transcript between a student and their coach:

${conversationTranscript}

Provide a short, constructive, and motivating session feedback summary in this JSON format:
{
  "strengths": ["string", "string"],
  "improvements": ["string", "string"],
  "usefulExpressionsLearned": ["string", "string"],
  "nextGoal": "string"
}
Only output valid JSON.`;

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    const { data } = await callGeminiWithFallback(model, apiKey, payload);
    const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    res.json(JSON.parse(jsonStr));
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🎙️  AIcoach Voice Bot is LIVE!`);
  console.log(`👉  Open in your browser: http://localhost:${PORT}`);
  console.log(`=================================================\n`);
});
