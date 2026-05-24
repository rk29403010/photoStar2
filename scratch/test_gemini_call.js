import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';
import { join } from 'node:path';

// Use the API key from .env.local
const apiKey = 'AIzaSyBaSncRkLUNOthzoum_HD8-ghBU8HW_PxU';
const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
    const imagePath = 'scratch/overview.jpg';
    const imageBuffer = await fs.readFile(imagePath);
    
    // Load the prompt from theprompts builder
    const { buildGeminiFlashPrompt } = await import('../src/services/aiMetadata/geminiPrompts.ts');
    const prompt = buildGeminiFlashPrompt({
        filename: '221421-082918_05.jpg',
        exifDataString: '',
        imageStrategy: 'overview_only',
        approvedTagVocabulary: ['1920s'],
        originalImagePixelWidth: 3113,
        originalImagePixelHeight: 4235
    });

    console.log('Sending request to gemini-2.5-flash...');
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
        }
    });

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: 'image/jpeg'
            }
        }
    ]);

    const text = result.response.text();
    console.log('Raw response from Gemini:');
    console.log(text);
}

run().catch(console.error);
