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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    const aiProvider = LOVABLE_API_KEY ? "lovable" : OPENAI_API_KEY ? "openai" : null;
    const aiApiKey = LOVABLE_API_KEY || OPENAI_API_KEY;

    if (!aiProvider || !aiApiKey) {
      console.error("No AI API key configured. Set LOVABLE_API_KEY or OPENAI_API_KEY.");
      return new Response(
        JSON.stringify({ error: "AI service not configured. Add LOVABLE_API_KEY or OPENAI_API_KEY in Supabase Edge Function secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiBaseUrl = aiProvider === "lovable"
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const aiModel = aiProvider === "lovable"
      ? (Deno.env.get("LOVABLE_MODEL") || "google/gemini-3-pro-preview")
      : (Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini");

    const systemPrompt = `You are an expert resume parser implementing the NER-KE (Named Entity Recognition & Keyword Extraction) Algorithm.

## ALGORITHM SPECIFICATION: NER-KE v2.0

### CORE PRINCIPLE: ZERO HALLUCINATION
You must ONLY extract and reference information that is EXPLICITLY written in the resume text.
- If information is not present, mark it as "NOT_FOUND" or empty array
- NEVER infer, assume, or generate any data not in the source text
- Every extracted entity must have a direct text match in the resume

### PHASE 1: TEXT PREPROCESSING
1. Parse the resume text line-by-line
2. Identify section boundaries (Education, Experience, Skills, Projects, etc.)
3. Preserve original phrasing for extraction

### PHASE 2: DETERMINISTIC ENTITY EXTRACTION
Extract using pattern matching and keyword recognition:

**PERSON_NAME**: Look for name at the top of resume or after "Name:" label
**CONTACT_INFO**: Email patterns, phone patterns, LinkedIn URLs

**SKILLS_LIST** (Technical & Soft):
- Programming languages: Python, Java, JavaScript, C++, etc.
- Frameworks: React, Angular, Django, Spring, etc.
- Tools: Git, Docker, AWS, etc.
- Extract EXACT spelling as written

**PROJECT_LIST** with attributes:
- Project name (EXACT as written)
- Technologies used (ONLY those explicitly mentioned for this project)
- Brief description (use original text, do not paraphrase)
- Quantifiable outcomes if mentioned (numbers, percentages)

**EXPERIENCE_LIST**:
- Company/Organization name (EXACT)
- Role/Title (EXACT)
- Duration if mentioned
- Key responsibilities (use original phrasing)

**EDUCATION_LIST**:
- Degree name (EXACT)
- Institution name (EXACT)
- Year/Duration if mentioned
- GPA/Grades if mentioned

**ACHIEVEMENTS_LIST**:
- Certifications (EXACT names)
- Awards (EXACT names)
- Quantifiable metrics (numbers, percentages as written)

### PHASE 3: TEMPLATE-BASED SUMMARY GENERATION
Generate candidateSummary using ONLY this template:

"[NAME or 'Candidate'] [has/with] [SKILLS count] technical skills including [TOP 3-5 SKILLS from SKILLS_LIST]. [IF EXPERIENCE: 'Experience at [ORGANIZATION names].'] [IF PROJECTS: 'Worked on [PROJECT count] projects including [PROJECT names].'] [IF EDUCATION: 'Education: [DEGREE] from [INSTITUTION].']"

STRICT RULES:
- Use ONLY words appearing in the resume
- If a section is empty/NOT_FOUND, OMIT that part entirely
- Do NOT add descriptors (skilled, proficient, expert) unless explicitly in resume
- Do NOT assume experience levels or years

### PHASE 4: ENTITY-ANCHORED QUESTION GENERATION
Generate ${numberOfQuestions} questions where each MUST:

1. **Introduction Question**: 
   "Tell me about yourself and your background in [EXTRACTED_SKILL_DOMAIN]"
   - Use actual skill domain from SKILLS_LIST

2. **Project-Specific Question** (if projects exist):
   "Can you walk me through your [EXACT_PROJECT_NAME] project? What was your role and what technologies did you use?"
   - Use EXACT project name from PROJECT_LIST

3. **Experience-Based Questions** (if experience exists):
   "At [EXACT_COMPANY_NAME], you worked as [EXACT_ROLE]. Can you describe [specific responsibility from resume]?"
   - Reference EXACT company and role

4. **Technical Skill Questions**:
   "You mentioned experience with [EXACT_SKILL]. How did you apply it in [EXACT_PROJECT or EXACT_ROLE]?"
   - Cross-reference skills with projects/experience

5. **Achievement/Metrics Questions** (if achievements exist):
   "You achieved [EXACT_METRIC from resume]. How did you accomplish this?"
   - Use EXACT numbers/percentages from resume

### VALIDATION CHECKLIST (Must pass all):
□ Every skill in summary exists in SKILLS_LIST extracted from resume
□ Every project name matches EXACT spelling in resume
□ Every company name matches EXACT spelling in resume
□ Every metric/number was copied from resume text
□ No adjectives added that weren't in original text
□ candidateSummary contains ONLY traceable phrases`;

    const userPrompt = `EXECUTE NER-KE ALGORITHM v2.0 ON THIS RESUME:

===== RESUME TEXT START =====
${resumeText}
===== RESUME TEXT END =====

STEP-BY-STEP EXECUTION:

STEP 1 - PREPROCESSING:
- Parse each line of the resume
- Identify section headers

STEP 2 - ENTITY EXTRACTION:
For each entity type, extract ONLY what is explicitly written.
If not found, use empty array or "NOT_FOUND".

STEP 3 - SUMMARY GENERATION:
Create candidateSummary using ONLY the template and extracted entities.
Omit any section where entities were not found.

STEP 4 - QUESTION GENERATION:
Generate exactly ${numberOfQuestions} questions, each anchored to specific extracted entities.
Every question must contain at least one EXACT term from the resume.

STEP 5 - VALIDATION:
Before output, verify:
- Can I ctrl+F find each extracted skill/project/company in the resume? YES/NO
- Does each question contain a verbatim term from the resume? YES/NO

OUTPUT the structured extraction result.`;

    const response = await fetch(aiBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_and_generate",
              description: "Extract entities from resume and generate interview questions",
              parameters: {
                type: "object",
                properties: {
                  extractedEntities: {
                    type: "object",
                    description: "Entities extracted using NER-KE algorithm - ONLY include what is explicitly in resume",
                    properties: {
                      name: { type: "string", description: "Candidate name if found, otherwise 'Candidate'" },
                      email: { type: "string", description: "Email if found, otherwise empty string" },
                      skills: { type: "array", items: { type: "string" }, description: "EXACT skill names from resume - no inference" },
                      projects: { 
                        type: "array", 
                        items: { 
                          type: "object",
                          properties: {
                            name: { type: "string", description: "EXACT project name as written" },
                            technologies: { type: "array", items: { type: "string" }, description: "Technologies explicitly mentioned for this project" },
                            description: { type: "string", description: "Brief description using original text" },
                            metrics: { type: "string", description: "Quantifiable outcomes if mentioned" }
                          },
                          required: ["name"]
                        },
                        description: "Projects with EXACT names from resume" 
                      },
                      experience: { 
                        type: "array", 
                        items: { 
                          type: "object",
                          properties: {
                            company: { type: "string", description: "EXACT company name" },
                            role: { type: "string", description: "EXACT job title" },
                            duration: { type: "string", description: "Duration if mentioned" },
                            responsibilities: { type: "array", items: { type: "string" }, description: "Key responsibilities using original phrasing" }
                          },
                          required: ["company", "role"]
                        },
                        description: "Work experience with EXACT company names and roles" 
                      },
                      education: { 
                        type: "array", 
                        items: { 
                          type: "object",
                          properties: {
                            degree: { type: "string", description: "EXACT degree name" },
                            institution: { type: "string", description: "EXACT institution name" },
                            year: { type: "string", description: "Graduation year if mentioned" },
                            gpa: { type: "string", description: "GPA if mentioned" }
                          },
                          required: ["degree", "institution"]
                        },
                        description: "Education with EXACT degree and institution names" 
                      },
                      achievements: { type: "array", items: { type: "string" }, description: "Certifications, awards, metrics - EXACT as written" }
                    },
                    required: ["name", "skills"]
                  },
                  candidateSummary: { type: "string", description: "Factual summary using ONLY extracted entities. Template-based, no assumptions." },
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string", description: "Interview question - MUST contain EXACT terms from resume" },
                        category: { type: "string", enum: ["Introduction", "Project-Based", "Experience-Based", "Technical", "Behavioral", "Achievement-Based"] },
                        skillAssessed: { type: "string", description: "Skill being assessed - use EXACT skill name from resume" },
                        resumeReference: { type: "string", description: "The EXACT term/phrase from resume this question references" },
                        answerTip: { type: "string", description: "Tip for answering. Use STAR method for behavioral questions." }
                      },
                      required: ["question", "category", "skillAssessed", "resumeReference", "answerTip"]
                    }
                  },
                  extractionConfidence: {
                    type: "object",
                    properties: {
                      skillsFound: { type: "number", description: "Number of unique skills extracted" },
                      projectsFound: { type: "number", description: "Number of projects extracted" },
                      experienceFound: { type: "number", description: "Number of work experiences extracted" },
                      educationFound: { type: "number", description: "Number of education entries extracted" },
                      overallQuality: { type: "string", enum: ["high", "medium", "low"], description: "Overall extraction quality" }
                    },
                    required: ["skillsFound", "overallQuality"]
                  }
                },
                required: ["extractedEntities", "candidateSummary", "questions", "extractionConfidence"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_and_generate" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI provider error:", { provider: aiProvider, status: response.status, errorText });
      
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

      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "Invalid AI API key. Check LOVABLE_API_KEY / OPENAI_API_KEY." }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (errorText.toLowerCase().includes("insufficient_quota")) {
        return new Response(
          JSON.stringify({ error: "AI quota exhausted. Top up billing or switch provider key." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Failed to generate questions (${aiProvider} provider error)` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("AI response received");
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      console.log("NER-KE Extraction complete:");
      console.log("- Skills found:", result.extractionConfidence?.skillsFound || 0);
      console.log("- Questions generated:", result.questions?.length || 0);
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
