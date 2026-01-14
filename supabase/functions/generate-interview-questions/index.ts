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

    const systemPrompt = `You are an expert HR interviewer and career coach. Your task is to analyze a candidate's resume and generate insightful, personalized interview questions that are commonly asked in real job interviews.

Generate exactly ${numberOfQuestions} interview questions based on the resume provided. 

IMPORTANT - ALWAYS include these essential questions in order:
1. FIRST question MUST be an introduction question like "Tell me about yourself" or "Walk me through your background"
2. SECOND question MUST be about their projects/work experience mentioned in the resume like "Tell me about the projects you've worked on" or "Describe a significant project from your experience"
3. Remaining questions should cover:
   - Technical skills mentioned in the resume
   - Behavioral scenarios (STAR format)
   - Problem-solving abilities
   - Career goals and cultural fit

The questions should:
- Be specific to the candidate's actual experience, skills, and background from the resume
- Reference specific technologies, companies, or achievements mentioned
- Include both standard interview questions and personalized ones
- Test communication skills, technical knowledge, and soft skills

For each question, also provide:
- The category (Introduction, Experience-based, Technical, Behavioral, Situational, or Soft Skills)
- The skill or competency being assessed
- A brief tip for what makes a good answer (mention STAR method for behavioral questions)`;

    const userPrompt = `Analyze this resume and generate ${numberOfQuestions} personalized interview questions. 

MANDATORY: 
- Question 1 MUST be an introduction/self-introduction question
- Question 2 MUST be about their projects and work experience
- Remaining questions should be specific to the skills, technologies, and experience mentioned

RESUME:
${resumeText}

Generate questions that a real interviewer would ask based on this specific resume.`;

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
                  candidateSummary: {
                    type: "string",
                    description: "A brief summary of the candidate's profile based on the resume"
                  }
                },
                required: ["questions", "candidateSummary"],
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
