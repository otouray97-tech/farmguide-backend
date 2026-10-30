require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const MODEL_ID = 'openai/gpt-oss-120b';
const BACKEND_VERSION = '2.1.0';
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '12kb', strict: true }));

const requestCounts = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;

app.use('/ask', (req, res, next) => {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const entry = requestCounts.get(key);
  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    requestCounts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (entry.count >= MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many questions. Please wait a minute and try again.' });
  }
  entry.count += 1;
  next();
});

app.get('/', (req, res) => {
  res.set('X-FarmGuide-Version', BACKEND_VERSION);
  res.json({
    status: 'FarmGuide backend is running with Groq AI',
    version: BACKEND_VERSION,
    model: MODEL_ID,
  });
});

app.post('/ask', async (req, res) => {
  const { question, country, month } = req.body || {};
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }
  if (question.trim().length > 2000) {
    return res.status(400).json({ error: 'Please keep your question under 2,000 characters.' });
  }
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not configured');
    return res.status(503).json({ error: 'The farm advice service is missing its GROQ_API_KEY setting in Render.' });
  }

  try {
    const countryName = ['Gambia', 'Senegal', 'Benin', 'Ghana', 'Nigeria', 'Togo', 'Burkina Faso', 'Mali'].includes(country) ? country : 'West Africa';
    const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].includes(month) ? month : 'this month';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
      model: MODEL_ID,
        messages: [
          {
            role: 'system',
            content: `You are FarmGuide, a careful agricultural information assistant for West African farmers.
The farmer says they are in ${countryName} and it is ${monthName}.
Use plain language and keep the answer under 150 words. Be clear when local conditions, crop variety, soil, or season could change the advice. Do not invent local regulations, product labels, exact chemical doses, or guaranteed yields. For pesticides, recommend following the locally approved product label and asking a local extension officer. For serious animal illness, advise contacting a veterinarian promptly. Ask one brief clarifying question when the answer depends on missing details.`,
          },
          {
            role: 'user',
            content: question,
          },
        ],
        max_tokens: 300,
      }),
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorCode = data?.error?.code || data?.error?.type || 'unknown';
      console.error('Groq request returned status:', response.status, 'code:', errorCode);
      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({ error: 'Groq rejected the backend key. Check that GROQ_API_KEY is valid in Render.' });
      }
      if (response.status === 429) {
        return res.status(502).json({ error: 'Groq is reporting a usage limit. Check the key’s quota or rate limit.' });
      }
      if (['model_decommissioned', 'model_not_found', 'invalid_model'].includes(errorCode)) {
        return res.status(502).json({ error: 'Groq rejected the configured model. Redeploy the latest FarmGuide backend.' });
      }
      return res.status(502).json({ error: 'Groq could not answer right now. Check the Render service logs for the provider status.' });
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
      console.error('Groq returned an unexpected response');
      return res.status(502).json({ error: 'Could not get a response. Please try again.' });
    }
    res.json({ answer });

  } catch (error) {
    console.error('AI request failed:', error.name === 'AbortError' ? 'upstream timeout' : error.message);
    res.status(500).json({ error: 'Could not get a response. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FarmGuide backend running on port ${PORT}`);
});
