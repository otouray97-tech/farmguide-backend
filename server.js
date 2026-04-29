require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'FarmGuide backend is running with Groq AI' });
});

app.post('/ask', async (req, res) => {
  const { question, country, month } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: `You are FarmGuide, a helpful agricultural advisor for West African farmers.
The farmer is in ${country || 'West Africa'} and it is currently ${month || 'this month'}.
Give practical, specific, and easy to understand advice.
Keep your response under 150 words.
Focus on crops and livestock relevant to West Africa.
Use simple language — many farmers may have basic education.`,
          },
          {
            role: 'user',
            content: question,
          },
        ],
        max_tokens: 300,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Could not get a response. Please try again.' });
    }

    const answer = data.choices[0].message.content;
    res.json({ answer });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Could not get a response. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FarmGuide backend running on port ${PORT}`);
});