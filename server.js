require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'FarmGuide backend is running with Gemini AI' });
});

// Main AI endpoint
app.post('/ask', async (req, res) => {
  const { question, country, month } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const prompt = `You are FarmGuide, a helpful agricultural advisor for West African farmers.
The farmer is in ${country || 'West Africa'} and it is currently ${month || 'this month'}.
Give practical, specific, and easy to understand advice.
Keep your response under 150 words.
Focus on crops and livestock relevant to West Africa.
Use simple language — many farmers may have basic education.

Farmer's question: ${question}`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    res.json({ answer });

  } catch (error) {
    console.error('Gemini API error:', JSON.stringify(error, null, 2));
    console.error('Error message:', error.message);
    res.status(500).json({ 
      error: 'Could not get a response. Please try again.',
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FarmGuide backend running on port ${PORT}`);
});