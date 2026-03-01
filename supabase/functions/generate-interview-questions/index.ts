import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing from environment");
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY environment variable is not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("GEMINI_API_KEY found, generating questions...");

    const systemPrompt = `You are an expert technical interviewer and resume analyst.

## CORE PRINCIPLE: ZERO HALLUCINATION
You must ONLY extract and reference information that is EXPLICITLY written in the resume text.

## YOUR TASK
1. Parse the resume to extract: skills, technologies, job titles, companies, projects, education, certifications, achievements
2. Generate insightful interview questions based ONLY on what is found
3. Cover a mix of categories: Technical, Behavioral, Situational, Experience-based

## OUTPUT FORMAT
Return ONLY a JSON object (no markdown, no extra text) with this EXACT structure:
{
  "candidateSummary": "A 2-3 sentence summary of the candidate based on resume",
  "extractedEntities": {
    "name": "candidate name or Unknown",
    "skills": ["skill1", "skill2"],
    "projects": [{"name": "project name", "technologies": ["tech1"], "description": "brief desc"}],
    "experience": [{"company": "company", "role": "role", "duration": "duration"}],
    "education": [{"degree": "degree", "institution": "institution"}],
    "achievements": ["achievement1"]
  },
  "extractionConfidence": {
    "skillsFound": <number>,
    "projectsFound": <number>,
    "experienceFound": <number>,
    "educationFound": <number>,
    "overallQuality": "high" | "medium" | "low"
  },
  "questions": [
    {
      "question": "The interview question text",
      "category": "Technical",
      "skillAssessed": "exact skill from resume",
      "resumeReference": "what part of resume this relates to",
      "answerTip": "A brief tip for answering well"
    }
  ]
}

Categories: Technical | Behavioral | Situational | Experience | Leadership | Problem-Solving`;

    const userPrompt = `Analyze this resume and generate exactly ${numberOfQuestions} interview questions:

===== RESUME TEXT START =====
${resumeText}
===== RESUME TEXT END =====

Return the JSON object with candidateSummary, extractedEntities, extractionConfidence, and questions array.`;

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
        JSON.stringify({ error: "Gemini API request failed", status: res.status, details: errText.substring(0, 200) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("Empty response from Gemini", JSON.stringify(data).substring(0, 300));
      return new Response(
        JSON.stringify({ error: "Empty response from Gemini" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Try cleaning markdown
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        try {
          parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
        } catch (e2) {
          console.error("Could not parse JSON from Gemini:", text.substring(0, 300));
          return new Response(
            JSON.stringify({ error: "Invalid JSON response from AI" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.error("No JSON object found in response:", text.substring(0, 300));
        return new Response(
          JSON.stringify({ error: "Invalid JSON response from AI" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Handle case where Gemini returns an array instead of object
    if (Array.isArray(parsed)) {
      const questions = parsed.map((q: any) => ({
        question: q.question || q.text || "",
        category: q.category || "Technical",
        skillAssessed: q.skillAssessed || q.relatedSkill || "",
        resumeReference: q.resumeReference || "",
        answerTip: q.answerTip || q.expectedKeyPoints?.join(", ") || "Be specific and use examples",
      }));
      parsed = {
        candidateSummary: "Resume analyzed successfully.",
        extractedEntities: { name: "Candidate", skills: [], projects: [], experience: [], education: [], achievements: [] },
        extractionConfidence: { skillsFound: 0, projectsFound: 0, experienceFound: 0, educationFound: 0, overallQuality: "medium" },
        questions,
      };
    }

    // Ensure questions have correct field names
    if (parsed.questions && Array.isArray(parsed.questions)) {
      parsed.questions = parsed.questions.map((q: any) => ({
        question: q.question || q.text || "",
        category: q.category || "Technical",
        skillAssessed: q.skillAssessed || q.relatedSkill || "",
        resumeReference: q.resumeReference || "",
        answerTip: q.answerTip || q.expectedKeyPoints?.join(", ") || "Be specific and use examples",
      }));
    }

    console.log("Successfully generated", parsed.questions?.length, "questions");

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
