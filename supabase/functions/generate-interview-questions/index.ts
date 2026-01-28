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

    // Standard Interview Questions with Resume Context
    const systemPrompt = `You are an expert interview coach. Your task is to extract key information from the resume and generate standard interview questions that are personalized based on the candidate's background.

## EXTRACTION RULES (STRICT - NO HALLUCINATION):
- Extract ONLY information explicitly written in the resume
- Use EXACT names, skills, and terms as written
- If information is not present, mark as empty or "NOT_FOUND"

## STANDARD INTERVIEW QUESTIONS TO GENERATE:
You must generate exactly these 5 questions, personalized with resume context:

1. **"Tell me about yourself"** - Category: Introduction
   - Tip should reference their background/skills from resume

2. **"What are your strengths?"** - Category: Behavioral  
   - Tip should suggest mentioning specific skills from their resume

3. **"What are your weaknesses?"** - Category: Behavioral
   - Tip should help them frame weaknesses constructively

4. **"Why should we hire you over other qualified candidates?"** - Category: Behavioral
   - Tip should reference their unique projects/experience from resume

5. **"Tell me about the projects you have worked on"** - Category: Project-Based
   - Tip should specifically mention their actual project names from the resume`;

    const userPrompt = `EXTRACT RESUME INFO AND GENERATE PERSONALIZED STANDARD QUESTIONS:

===== RESUME TEXT START =====
${resumeText}
===== RESUME TEXT END =====

Extract the candidate's name, skills, projects, and experience. Then generate the 5 standard interview questions with personalized tips based on their actual resume content.`;

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
              name: "extract_and_generate",
              description: "Extract entities from resume and generate interview questions",
              parameters: {
                type: "object",
                properties: {
                  extractedEntities: {
                    type: "object",
                    description: "Entities extracted using NER-KE algorithm - ONLY include what is explicitly in resume",
                    properties: {
                      name: { 
                        type: "string", 
                        description: "Candidate name if found, otherwise 'Candidate'" 
                      },
                      email: { 
                        type: "string", 
                        description: "Email if found, otherwise empty string" 
                      },
                      skills: { 
                        type: "array", 
                        items: { type: "string" }, 
                        description: "EXACT skill names from resume - no inference" 
                      },
                      projects: { 
                        type: "array", 
                        items: { 
                          type: "object",
                          properties: {
                            name: { type: "string", description: "EXACT project name as written" },
                            technologies: { 
                              type: "array", 
                              items: { type: "string" },
                              description: "Technologies explicitly mentioned for this project"
                            },
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
                            responsibilities: { 
                              type: "array", 
                              items: { type: "string" },
                              description: "Key responsibilities using original phrasing"
                            }
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
                      achievements: { 
                        type: "array", 
                        items: { type: "string" }, 
                        description: "Certifications, awards, metrics - EXACT as written" 
                      }
                    },
                    required: ["name", "skills"]
                  },
                  candidateSummary: {
                    type: "string",
                    description: "Factual summary using ONLY extracted entities. Template-based, no assumptions. Omit sections with no data."
                  },
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { 
                          type: "string", 
                          description: "The standard interview question" 
                        },
                        category: { 
                          type: "string", 
                          enum: ["Introduction", "Behavioral", "Project-Based"]
                        },
                        skillAssessed: { 
                          type: "string", 
                          description: "General skill being assessed" 
                        },
                        answerTip: { 
                          type: "string", 
                          description: "Personalized tip based on resume content. Reference their actual skills/projects." 
                        }
                      },
                      required: ["question", "category", "skillAssessed", "answerTip"]
                    }
                  },
                  extractionConfidence: {
                    type: "object",
                    properties: {
                      skillsFound: { type: "number", description: "Number of unique skills extracted" },
                      projectsFound: { type: "number", description: "Number of projects extracted" },
                      experienceFound: { type: "number", description: "Number of work experiences extracted" },
                      educationFound: { type: "number", description: "Number of education entries extracted" },
                      overallQuality: { 
                        type: "string", 
                        enum: ["high", "medium", "low"],
                        description: "Overall extraction quality based on resume detail"
                      }
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
      console.log("NER-KE Extraction complete:");
      console.log("- Skills found:", result.extractionConfidence?.skillsFound || 0);
      console.log("- Projects found:", result.extractionConfidence?.projectsFound || 0);
      console.log("- Experience found:", result.extractionConfidence?.experienceFound || 0);
      console.log("- Questions generated:", result.questions?.length || 0);
      
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
