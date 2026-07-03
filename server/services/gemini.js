// server/services/gemini.js
// Nano Banana (Gemini) image generation for boost media

export async function generateGeminiImage(topic, keywords = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  GEMINI_API_KEY not set, skipping image generation');
    return null;
  }

  const prompt = `Create a clean, professional social media graphic for Twitter/X about: "${topic}"

Style requirements:
- Modern, minimalist design
- Bold typography with key message
- Vibrant but professional colors
- No text smaller than 24pt
- 1200x675px aspect ratio (Twitter optimal)
- Include subtle visual elements related to: ${keywords.join(', ') || topic}
- Should look like a professional marketing graphic, not AI-generated art

The image should be eye-catching in a Twitter feed and communicate value instantly.`;

  try {
    console.log('🎨 Calling Gemini API for image generation...');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Gemini API error:', response.status, error.substring(0, 200));
      return null;
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        console.log(`✅ Generated image: ${imageBuffer.length} bytes`);
        return { buffer: imageBuffer, mimeType: part.inlineData.mimeType };
      }
    }

    console.warn('⚠️  No image in Gemini response');
    return null;
  } catch (err) {
    console.error('❌ Gemini image generation failed:', err.message);
    return null;
  }
}
