import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, answer, category, skillAssessed, fusionMetrics } = await req.json();
    
    if (!question || !answer) {
      return new Response(
        JSON.stringify({ error: "Question and answer are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const deliveryContext = fusionMetrics ? `
Delivery Metrics Observed:
- Eye Contact: ${fusionMetrics.eyeContact || 0}%
- Posture: ${fusionMetrics.posture || 0}%
- Body Language: ${fusionMetrics.bodyLanguage || 0}%
- Facial Expression: ${fusionMetrics.facialExpression || 0}%
- Voice Quality: ${fusionMetrics.voiceQuality || 0}%
- Speech Clarity: ${fusionMetrics.speechClarity || 0}%
- Content Engagement: ${fusionMetrics.contentEngagement || 0}%
- Overall Confidence: ${fusionMetrics.confidence || 0}%
` : '';

    const systemPrompt = `You are an expert interview coach and HR professional. Evaluate the candidate's answer considering both content quality and delivery metrics.

## EVALUATION CRITERIA

### Content Score (0-100):
- Relevance: Does the answer directly address the question?
- Specificity: Are there concrete examples, not vague generalizations?
- Structure: Is the answer well-organized (STAR method preferred)?
- Impact: Does the candidate show measurable results?
- Skill Demonstration: Does it showcase the assessed skill?

### Delivery Score (0-100):
- Eye contact and engagement with camera
- Confident posture and body language
- Clear, well-paced speech
- Professional presence

Be ENCOURAGING but HONEST. Focus on specific improvements.

IMPORTANT: Return ONLY valid JSON with this exact structure:
{
  "contentScore": <number 0-100>,
  "deliveryScore": <number 0-100>,
  "overallScore": <number 0-100>,
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1"],
  "sampleAnswer": "<sample better answer>",
  "overallFeedback": "<2-3 encouraging sentences>",
  "deliveryFeedback": "<specific delivery feedback>",
  "quickTip": "<5-7 word tip>"
}`;

    const userPrompt = `Evaluate this interview response:

**Category:** ${category}
**Skill Assessed:** ${skillAssessed}
**Question:** "${question}"

**Candidate's Answer:** "${answer}"

${deliveryContext}

Provide encouraging, specific feedback. Return ONLY valid JSON.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt + "\n\n" + userPrompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          topP: 0.95,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to evaluate answer" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Empty response from Gemini" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      // Try to extract JSON from response
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        result = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
      } else {
        console.error("Could not parse JSON from Gemini:", text.substring(0, 300));
        return new Response(
          JSON.stringify({ error: "Invalid JSON response from AI" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Evaluation:", { question: question.slice(0, 50), score: result.overallScore });
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error evaluating answer:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
