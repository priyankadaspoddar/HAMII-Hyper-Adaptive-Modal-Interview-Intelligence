import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resumeText, numberOfQuestions = 5 } = await req.json();
    
    console.log("Generating interview questions from resume...");
    console.log("Resume length:", resumeText?.length || 0);
    
    if (!resumeText || resumeText.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Resume text is too short or empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert HR interviewer using a STRICT EXTRACTION-BASED ALGORITHM called NER-KE (Named Entity Recognition & Keyword Extraction). You must ONLY use information explicitly written in the resume - NEVER invent, assume, or hallucinate any details.

## ALGORITHM: NER-KE (Named Entity Recognition & Keyword Extraction)

### PHASE 1: ENTITY EXTRACTION (Parse resume line-by-line)
Extract ONLY what is explicitly written - do NOT infer or assume:
- PERSON_NAME: Extract candidate's name if present, otherwise use "The candidate"
- SKILLS_LIST: Extract exact technology names, tools, frameworks, languages (e.g., "React", "Python", "AWS")
- PROJECT_LIST: Extract exact project names and their described functionalities
- ORGANIZATION_LIST: Extract company names, institution names
- ROLE_LIST: Extract job titles, positions held
- EDUCATION_LIST: Extract degrees, certifications, courses
- METRICS_LIST: Extract numbers, percentages, achievements with quantifiable data

### PHASE 2: CANDIDATE SUMMARY GENERATION (CRITICAL - NO HALLUCINATION)
Create summary using ONLY extracted entities with this template:
"[PERSON_NAME] has experience in [SKILLS_LIST]. [If PROJECT_LIST exists: 'Has worked on projects including [PROJECT_LIST].'] [If ORGANIZATION_LIST exists: 'Previous experience at [ORGANIZATION_LIST].'] [If EDUCATION_LIST exists: 'Education: [EDUCATION_LIST].']"

STRICT SUMMARY RULES:
- Use ONLY words and phrases that appear in the resume
- If a field was NOT found, OMIT that sentence entirely
- Do NOT add adjectives like "skilled", "experienced", "proficient" unless resume explicitly states them
- Do NOT assume years of experience unless explicitly stated
- Keep summary factual and directly traceable to resume text

### PHASE 3: QUESTION GENERATION (Reference-Based)
Generate ${numberOfQuestions} questions where each MUST reference extracted entities:
1. Introduction: "Tell me about yourself" - but tailor based on their specific [ROLE_LIST] and [SKILLS_LIST]
2. Project-specific: Use EXACT name from [PROJECT_LIST] - "Tell me about your [PROJECT_NAME] project"
3-${numberOfQuestions}: Each must reference a SPECIFIC item from SKILLS_LIST, ORGANIZATION_LIST, or METRICS_LIST

## VALIDATION BEFORE OUTPUT:
For candidateSummary: Can I highlight each phrase in the original resume? If NO, remove it.
For each question: Does it contain a specific name/term from the resume? If NO, rewrite it.`;

    const userPrompt = `RESUME TEXT FOR NER-KE EXTRACTION:
"""
${resumeText}
"""

EXECUTE NER-KE ALGORITHM:

STEP 1: Extract all entities from the resume above (parse each line)
STEP 2: Generate candidateSummary using ONLY extracted entities - no assumptions, no embellishments
STEP 3: Generate exactly ${numberOfQuestions} questions, each referencing specific extracted entities

CRITICAL VALIDATION BEFORE OUTPUT:
□ Is every word in candidateSummary traceable to the resume? Remove any that aren't.
□ Does each question contain a specific name, technology, or company from the resume?
□ Have I avoided generic phrases like "your experience" in favor of specifics like "your experience at [Company Name]"?

OUTPUT: Return structured data with questions and candidateSummary based SOLELY on extracted resume content.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_questions",
              description: "Generate personalized interview questions based on the resume",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string", description: "The interview question" },
                        category: { 
                          type: "string", 
                          enum: ["Introduction", "Experience-based", "Technical", "Behavioral", "Situational", "Soft Skills"]
                        },
                        skillAssessed: { type: "string", description: "The skill or competency being assessed" },
                        answerTip: { type: "string", description: "A brief tip for what makes a good answer. Mention STAR method for behavioral questions." }
                      },
                      required: ["question", "category", "skillAssessed", "answerTip"],
                      additionalProperties: false
                    }
                  },
                  extractedEntities: {
                    type: "object",
                    description: "Entities extracted from the resume using NER-KE algorithm",
                    properties: {
                      name: { type: "string", description: "Candidate name extracted from resume" },
                      skills: { type: "array", items: { type: "string" }, description: "Exact skills/technologies from resume" },
                      projects: { type: "array", items: { type: "string" }, description: "Exact project names from resume" },
                      organizations: { type: "array", items: { type: "string" }, description: "Company/institution names from resume" },
                      roles: { type: "array", items: { type: "string" }, description: "Job titles from resume" },
                      education: { type: "array", items: { type: "string" }, description: "Degrees/certifications from resume" }
                    },
                    required: ["skills"],
                    additionalProperties: false
                  },
                  candidateSummary: {
                    type: "string",
                    description: "Summary generated ONLY from extracted entities - no assumptions or embellishments. Each phrase must be traceable to the resume."
                  }
                },
                required: ["questions", "extractedEntities", "candidateSummary"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_questions" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to generate questions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("AI response received");
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log("Generated", result.questions?.length || 0, "questions");
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback if no tool call
    return new Response(
      JSON.stringify({ error: "Failed to parse AI response" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating interview questions:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
