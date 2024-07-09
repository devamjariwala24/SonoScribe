require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Readable } = require('stream');
const speech = require('@google-cloud/speech');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const speechClient = new speech.SpeechClient();
const cartesiaApiKey = process.env.CARTESIA_API_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;

io.on('connection', (socket) => {
  console.log('New client connected');
  let recognizeStream = null;

  socket.on('audio', (audioChunk) => {
    const audioStream = new Readable();
    audioStream.push(audioChunk);
    audioStream.push(null);

    if (!recognizeStream) {
      recognizeStream = speechClient
        .streamingRecognize({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'en-US',
          },
          interimResults: true,
        })
        .on('error', console.error)
        .on('data', (data) => {
          const transcription = data.results[0].alternatives[0].transcript;
          socket.emit('transcription', transcription);

          if (data.results[0].isFinal) {
            generateAIReply(transcription);
          }
        });
    }

    audioStream.pipe(recognizeStream);
  });

  socket.on('force_interrupt', () => {
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }
    // Additional logic to stop TTS playback
  });

  socket.on('end_call', () => {
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    if (recognizeStream) {
      recognizeStream.end();
    }
  });

  async function generateAIReply(transcription) {
    const startTime = Date.now();

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'openai/gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: transcription },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const aiReply = response.data.choices[0].message.content;
      socket.emit('ai_reply', aiReply);

      // Generate speech using Cartesia TTS API
      const ttsResponse = await axios.post(
        'https://api.cartesia.ai/v1/tts',
        {
          text: aiReply,
          voice_id: 'en-US-Neural2-F', // Example voice ID
        },
        {
          headers: {
            'Authorization': `Bearer ${cartesiaApiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      // Send the audio buffer to the client
      socket.emit('tts_audio', ttsResponse.data);

      const latency = Date.now() - startTime;
      socket.emit('latency', latency);
    } catch (error) {
      console.error('Error generating AI reply:', error);
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`SonoScribe server running on port ${PORT}`));