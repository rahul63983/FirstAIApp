# 🎙️ AI English Speaking Coach — Voice Bot

An interactive, natural voice-powered English Speaking Coach web application powered by **Google Gemini** and your browser's Speech APIs.

---

## ✨ Features

- **🗣️ Natural Voice Conversation**:
  - Live Speech-to-Text (talk into your microphone naturally).
  - High-fidelity Speech Synthesis with customizable pace, pitch, and accent (US, UK, Australian, etc.).
  - **Continuous Hands-Free Mode**: Talks back and automatically listens for your response with silence detection.
  - **Barge-in / Interrupt Support**: Click "Stop Audio" or start speaking to interrupt the coach at any moment.

- **🔮 Audio-Reactive 3D Glowing Voice Orb**:
  - Dynamically pulses and transforms colors based on state:
    - 🔵 **Idle**: Soft glowing aura
    - 🟢 **Listening**: Expands and ripples with your microphone voice level
    - 🟡 **Thinking**: Swirling celestial particles while Gemini formulates a response
    - 🟣 **Speaking**: Pulsating sound waves synchronized to the coach's voice

- **🧠 Powered by Gemini with your 15-Point Coaching System**:
  - Friendly, encouraging, human-like conversation partner.
  - Asks **one clear question at a time** to maximize student speaking time.
  - Selective and constructive corrections:
    - *What you said*
    - *A more natural version*
    - *Why*
    - *Try again* (with audio pronunciation button)
  - Practice Scenarios:
    - ☕ Friendly Warm-Up & Casual Chat
    - 💼 Job Interview Practice
    - 📊 Workplace Meeting & Discussion
    - 🤝 Disagreeing Politely & Debating
    - 📖 Storytelling & Experience Sharing
    - 🍽️ Cafe & Travel Situations

- **📊 Session Feedback Summary**:
  - Click **Summary** anytime to generate an AI evaluation of your session:
    - What you did well (fluency, grammar, confidence)
    - Areas to refine
    - Useful vocabulary and expressions learned
    - A personalized micro speaking challenge for tomorrow

---

## 🚀 Quick Start

### 1. Start the Server

```bash
cd english-voice-coach
npm start
```

The server will launch at: **`http://localhost:3000`**

### 2. Configure Your Gemini API Key

You can configure your Gemini API Key in either of two easy ways:

1. **In the Web UI (Easiest)**:
   - Click the ⚙️ **Settings** gear icon in the top right.
   - Paste your key and click **Save Settings**.
   - Your key is saved locally in your browser.

2. **In `.env` File**:
   - Open `.env` in `english-voice-coach/` and set:
     ```env
     GEMINI_API_KEY=your_gemini_api_key_here
     ```
   - Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey).

### 3. Start Practicing!

- Click **Start Speaking** or press **Spacebar**.
- Allow microphone permissions when prompted by your browser (Chrome or Edge recommended).
- Speak naturally!
