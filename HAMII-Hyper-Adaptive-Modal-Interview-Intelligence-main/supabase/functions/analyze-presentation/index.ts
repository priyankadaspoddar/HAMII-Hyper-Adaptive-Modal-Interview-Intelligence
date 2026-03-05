import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function extractJsonFromResponse(response: string): unknown {
  if (!response || typeof response !== 'string') {
    throw new Error('Empty or invalid response');
  }

  let cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No JSON object found in response');
  }

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    cleaned = cleaned
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '');

    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      console.error('Failed to parse cleaned JSON:', cleaned.substring(0, 200));
      throw new Error(`Failed to parse JSON: ${e2 instanceof Error ? e2.message : 'Unknown error'}`);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, audioData, transcript } = await req.json();
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const visionSystemPrompt = `You are an expert presentation coach and behavioral analyst with advanced multimodal vision capabilities. Analyze the video frame with precision for:

## EMOTION DETECTION (Facial Action Coding System - FACS)
Detect micro-expressions and emotions:
- Happiness: Duchenne smile (AU6+AU12), raised cheeks, crow's feet
- Confidence: Relaxed brow, direct gaze, slight smile
- Nervousness: Lip biting, furrowed brow (AU4), tense jaw
- Engagement: Raised eyebrows (AU1+AU2), animated expressions
- Stress: Compressed lips, squinting, asymmetric expressions

## POSTURE ANALYSIS
Evaluate body positioning:
- Upright vs slouched spine alignment
- Shoulder position (rolled forward = low confidence, back = confident)
- Head tilt (neutral vs tilted - can indicate uncertainty)
- Distance from camera (too close = intimidating, too far = disengaged)
- Overall body tension or relaxation

## GESTURE RECOGNITION
Identify hand and body gestures:
- Open palms visible = honesty, confidence
- Crossed arms = defensive, closed off
- Fidgeting, touching face/hair = nervousness
- Steepled fingers = authority, confidence
- Hand movements synchronized with speech = engagement
- Hidden hands = lack of openness

## EYE CONTACT
Assess gaze direction and quality:
- Direct camera gaze = strong connection
- Looking away frequently = distraction or nervousness
- Steady vs darting eyes
- Blinking rate (excessive = stress)

Provide SPECIFIC observations with exact details of what you see. Be critical and honest.

IMPORTANT: Respond with ONLY valid JSON, no markdown, no code blocks, no extra text:
{"eyeContact": <number 25-100>, "posture": <number 25-100>, "expression": <number 25-100>, "bodyLanguage": <number 25-100>, "detectedEmotion": "<primary emotion>", "gestureType": "<gesture type>", "postureType": "<posture type>", "feedback": "<specific observations>"}`;

    // Extract base64 data from data URL
    const base64Match = imageData?.match(/^data:image\/\w+;base64,(.+)$/);
    const base64Data = base64Match ? base64Match[1] : imageData;
    const mimeType = imageData?.match(/^data:(image\/\w+);base64/)?.[1] || 'image/jpeg';

    const visionUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const visionResponse = await fetch(visionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: visionSystemPrompt + '\n\nAnalyze this presentation frame for eye contact, posture, facial expression, and body language. Be specific about what you observe. Return ONLY valid JSON.' },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!visionResponse.ok) {
      const errText = await visionResponse.text();
      console.error('Gemini vision API error:', visionResponse.status, errText);
      throw new Error(`Gemini vision API failed: ${visionResponse.status}`);
    }

    const visionResult = await visionResponse.json();
    const rawVisionContent = visionResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const visionScores = extractJsonFromResponse(rawVisionContent) as {
      eyeContact: number;
      posture: number;
      expression: number;
      bodyLanguage: number;
      detectedEmotion?: string;
      gestureType?: string;
      postureType?: string;
      feedback?: string;
    };

    let voiceScores = { clarity: 70, pace: 70, tone: 70, engagement: 70, feedback: 'Not enough speech data yet.' };
    
    if (transcript && transcript.length > 20) {
      const voicePrompt = `You are an expert speech therapist and presentation coach analyzing speech content and delivery.

Analyze the transcript and provide scores (25-100) for:
- Clarity: Is the speech clear and articulate? (25-100)
- Pace: Is the speaking pace appropriate? (25-100)
- Tone: Is the tone engaging and confident? (25-100)
- Engagement: Is the content well-structured? Check for filler words. (25-100)

IMPORTANT: Respond with ONLY valid JSON, no markdown, no code blocks:
{"clarity": <number>, "pace": <number>, "tone": <number>, "engagement": <number>, "feedback": "<specific feedback>"}

Analyze this presentation transcript and provide specific feedback: "${transcript}"`;

      const voiceUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

      const voiceResponse = await fetch(voiceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: voicePrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 512,
          }
        })
      });

      if (voiceResponse.ok) {
        const voiceResult = await voiceResponse.json();
        const rawVoiceContent = voiceResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        voiceScores = extractJsonFromResponse(rawVoiceContent) as typeof voiceScores;
        console.log('Voice analysis completed:', voiceScores);
      }
    }

    return new Response(
      JSON.stringify({
        vision: visionScores,
        voice: voiceScores,
        overall: Math.round(
          ((visionScores.eyeContact || 50) + (visionScores.posture || 50) + 
           (voiceScores.clarity || 50) + (voiceScores.engagement || 50)) / 4
        )
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in analyze-presentation function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
