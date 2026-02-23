import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface QuestionResult {
  question: string;
  category: string;
  answer: string;
  contentScore: number;
  deliveryScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
}

interface SessionMetrics {
  avgEyeContact: number;
  avgPosture: number;
  avgSpeechClarity: number;
  avgBodyLanguage: number;
  avgOverallScore: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { results, metrics, candidateName } = await req.json() as {
      results: QuestionResult[];
      metrics: SessionMetrics;
      candidateName?: string;
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const questionsContext = results.map((r, i) => 
      `Q${i + 1} (${r.category}): "${r.question}"
      Answer: "${r.answer.slice(0, 300)}${r.answer.length > 300 ? '...' : ''}"
      Scores: Content ${r.contentScore}%, Delivery ${r.deliveryScore}%, Overall ${r.overallScore}%
      Strengths: ${r.strengths.join(', ') || 'None identified'}
      Areas to improve: ${r.improvements.join(', ') || 'None identified'}`
    ).join('\n\n');

    const metricsContext = `
    Session Delivery Metrics:
    - Eye Contact: ${metrics.avgEyeContact}%
    - Posture: ${metrics.avgPosture}%
    - Speech Clarity: ${metrics.avgSpeechClarity}%
    - Body Language: ${metrics.avgBodyLanguage}%
    - Average Overall Score: ${metrics.avgOverallScore}%
    `;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `You are an expert interview coach providing a comprehensive session recap. Generate a professional, encouraging, and actionable summary.

Your summary should include:
1. **Executive Summary** (2-3 sentences): Overall performance rating and key takeaway
2. **Top Strengths** (3 bullet points): What the candidate did well, with specific examples
3. **Priority Improvements** (3 bullet points): Most impactful areas to work on, with specific action items
4. **Delivery Analysis**: Brief analysis of non-verbal communication (eye contact, posture, body language)
5. **Content Quality**: Assessment of answer structure, relevance, and depth
6. **Action Plan**: 3 specific, actionable steps for improvement before the next interview

Be specific and reference actual answers/behaviors when possible. Use an encouraging but honest tone.

Respond with valid JSON in this exact format:
{
  "executiveSummary": "<2-3 sentence overview>",
  "performanceRating": "<Excellent|Strong|Competent|Developing|Needs Work>",
  "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "priorityImprovements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "deliveryAnalysis": "<paragraph analyzing non-verbal communication>",
  "contentQuality": "<paragraph assessing answer quality>",
  "actionPlan": ["<action 1>", "<action 2>", "<action 3>"],
  "motivationalNote": "<brief encouraging closing message>"
}`
          },
          {
            role: 'user',
            content: `Generate a session recap for ${candidateName || 'the candidate'}:

${metricsContext}

Interview Questions and Responses:
${questionsContext}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Usage limit reached. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices[0].message.content;
    
    let summary;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      summary = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content);
      summary = {
        executiveSummary: "Session completed successfully. Review individual question feedback for detailed insights.",
        performanceRating: metrics.avgOverallScore >= 80 ? "Strong" : metrics.avgOverallScore >= 60 ? "Competent" : "Developing",
        topStrengths: results.flatMap(r => r.strengths).slice(0, 3),
        priorityImprovements: results.flatMap(r => r.improvements).slice(0, 3),
        deliveryAnalysis: `Your delivery metrics show ${metrics.avgEyeContact}% eye contact and ${metrics.avgPosture}% posture score.`,
        contentQuality: `Your answers scored an average of ${metrics.avgOverallScore}% across ${results.length} questions.`,
        actionPlan: ["Practice with the STAR method", "Record yourself answering questions", "Research common industry questions"],
        motivationalNote: "Keep practicing! Every interview is a learning opportunity."
      };
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in summarize-interview-session:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
