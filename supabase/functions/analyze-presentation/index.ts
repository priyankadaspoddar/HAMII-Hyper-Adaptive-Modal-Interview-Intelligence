import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, audioData, transcript } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Analyze facial expressions and body language from image
    const visionAnalysis = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content: `You are an expert presentation coach and behavioral analyst with advanced multimodal vision capabilities. Analyze the video frame with precision for:

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

Respond ONLY with valid JSON:
{
  "eyeContact": <number 25-100>,
  "posture": <number 25-100>,
  "expression": <number 25-100>,
  "bodyLanguage": <number 25-100>,
  "detectedEmotion": "<primary emotion detected: happy/confident/neutral/nervous/stressed>",
  "gestureType": "<gesture observed: open/closed/fidgeting/expressive/minimal>",
  "postureType": "<upright/slouched/leaning/tense/relaxed>",
  "feedback": "<2-3 specific observations with actionable improvements>"
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this presentation frame for eye contact, posture, facial expression, and body language. Be specific about what you observe.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ]
      })
    });

    const visionResult = await visionAnalysis.json();
    const visionScores = JSON.parse(visionResult.choices[0].message.content);

    // Analyze voice quality and speech content
    let voiceScores = { clarity: 70, pace: 70, tone: 70, engagement: 70, feedback: 'Not enough speech data yet.' };
    
    if (transcript && transcript.length > 20) {
      const voiceAnalysis = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-pro',
          messages: [
            {
              role: 'system',
              content: `You are an expert speech therapist and presentation coach analyzing speech content and delivery for people with speaking difficulties.

IMPORTANT: Provide SPECIFIC, CONSTRUCTIVE feedback based on the actual transcript. Identify specific issues like:
- Filler words (um, uh, like, you know)
- Repetitions
- Incomplete sentences
- Pace issues (too fast/slow)
- Clarity issues (mumbling, unclear pronunciation)
- Confidence indicators (hesitations, qualifiers)

Analyze the transcript and provide scores (25-100) for:
- Clarity: Is the speech clear and articulate? Check for mumbling, slurring, unclear words. (25-100)
- Pace: Is the speaking pace appropriate (not too fast/slow)? Count words per minute if possible. (25-100)
- Tone: Is the tone engaging, professional, and confident? Check for monotone vs. varied. (25-100)
- Engagement: Is the content well-structured and engaging? Check for filler words, repetitions. (25-100)

Be honest and specific. Mention exact problems you see in the transcript.

Respond ONLY with valid JSON in this exact format:
{
  "clarity": <number 25-100>,
  "pace": <number 25-100>,
  "tone": <number 25-100>,
  "engagement": <number 25-100>,
  "feedback": "<specific feedback mentioning actual issues from the transcript>"
}`
            },
            {
              role: 'user',
              content: `Analyze this presentation transcript and provide specific, actionable feedback: "${transcript}"`
            }
          ]
        })
      });

      const voiceResult = await voiceAnalysis.json();
      voiceScores = JSON.parse(voiceResult.choices[0].message.content);
      console.log('Voice analysis completed:', voiceScores);
    }

    return new Response(
      JSON.stringify({
        vision: visionScores,
        voice: voiceScores,
        overall: Math.round(
          (visionScores.eyeContact + visionScores.posture + 
           voiceScores.clarity + voiceScores.engagement) / 4
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
