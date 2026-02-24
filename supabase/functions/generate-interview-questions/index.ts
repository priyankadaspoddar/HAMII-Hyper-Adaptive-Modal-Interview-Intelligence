import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { resumeText, numberOfQuestions = 5 } = body;

    if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 40) {
      return new Response(
        JSON.stringify({ error: "resumeText is missing or too short" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("ABARA");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ABARA environment variable is not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert technical interviewer and resume analyst implementing the NER-KE (Named Entity Recognition & Keyword Extraction) Algorithm v2.0.

## CORE PRINCIPLE: ZERO HALLUCINATION
You must ONLY extract and reference information that is EXPLICITLY written in the resume text.
- If information is not present, mark it as "NOT_FOUND" or empty array
- NEVER infer, assume, or generate any data not in the source text
- Every question MUST be directly tied to something mentioned in the resume

## YOUR TASK
1. Parse the resume to extract: skills, technologies, job titles, companies, projects, education, certifications, achievements
2. Generate insightful interview questions based ONLY on what is found
3. Cover a mix of categories: Technical, Behavioral, Situational, Experience-based
4. Return a valid JSON array of question objects

## OUTPUT FORMAT
Return ONLY a JSON array like this (no markdown, no extra text):
[
  {
    "id": 1,
    "question": "Can you walk me through your experience with [specific technology from resume]?",
    "category": "Technical",
    "difficulty": "Medium",
    "relatedSkill": "[exact skill/tech from resume]",
    "expectedKeyPoints": ["point 1", "point 2", "point 3"]
  }
]

Categories must be one of: Technical | Behavioral | Situational | Experience | Leadership | Problem-Solving
Difficulty must be one of: Easy | Medium | Hard`;

    const userPrompt = `EXECUTE NER-KE ALGORITHM v2.0 ON THIS RESUME:

===== RESUME TEXT START =====
${resumeText}
===== RESUME TEXT END =====

STEP-BY-STEP EXECUTION:
1. Extract all skills, technologies, tools mentioned
2. Extract all job roles, companies, durations
3. Extract all projects and achievements
4. Extract education and certifications
5. Based on extracted data ONLY, generate exactly ${numberOfQuestions} interview questions
6. Ensure variety across categories and difficulty levels
7. Return ONLY the JSON array, no extra text

Generate exactly ${numberOfQuestions} questions now.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const res = await fetch(url, {
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
          temperature: 0.2,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API failed:", res.status, errText);
      return new Response(
        JSON.stringify({ error: "Gemini API request failed", status: res.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Empty response from Gemini" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("Could not parse JSON from Gemini:", text.substring(0, 300));
      return new Response(
        JSON.stringify({ error: "Invalid JSON response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
