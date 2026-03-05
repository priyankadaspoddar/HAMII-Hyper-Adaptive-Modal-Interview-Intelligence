 import "https://deno.land/x/xhr@0.1.0/mod.ts";
 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
 };
 
 interface VisionMetrics {
   eyeContact: number;
   posture: number;
   bodyLanguage: number;
   facialExpression: number;
   detectedEmotion?: string;
   gestureType?: string;
   postureType?: string;
 }
 
 interface VoiceMetrics {
   clarity: number;
   pace: number;
   tone: number;
   engagement: number;
 }
 
 serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const { 
       question, 
       category,
       answer, 
       idealAnswer,
       keywords,
       visionMetrics,
       voiceMetrics,
       emotionHistory
     } = await req.json() as {
       question: string;
       category: string;
       answer: string;
       idealAnswer?: string;
       keywords?: string[];
       visionMetrics?: VisionMetrics;
       voiceMetrics?: VoiceMetrics;
       emotionHistory?: string[];
     };
 
     const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
     if (!LOVABLE_API_KEY) {
       throw new Error('LOVABLE_API_KEY is not configured');
     }
 
     // Build context for evaluation
     const deliveryContext = visionMetrics ? `
 Delivery Metrics Observed:
 - Eye Contact: ${visionMetrics.eyeContact}%
 - Posture: ${visionMetrics.posture}% (${visionMetrics.postureType || 'unknown'})
 - Body Language: ${visionMetrics.bodyLanguage}%
 - Facial Expression: ${visionMetrics.facialExpression}%
 - Detected Emotion: ${visionMetrics.detectedEmotion || 'neutral'}
 - Gesture Type: ${visionMetrics.gestureType || 'minimal'}
 ${voiceMetrics ? `
 Voice Analysis:
 - Clarity: ${voiceMetrics.clarity}%
 - Pace: ${voiceMetrics.pace}%
 - Tone: ${voiceMetrics.tone}%
 - Engagement: ${voiceMetrics.engagement}%
 ` : ''}
 ${emotionHistory?.length ? `Emotion Timeline: ${emotionHistory.join(' → ')}` : ''}
 ` : '';
 
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
             content: `You are an expert HR interview coach specializing in behavioral interviews. Your role is to evaluate answers using the STAR method (Situation, Task, Action, Result) and provide supportive, actionable feedback.
 
 ## EVALUATION CRITERIA
 
 ### Content Score (0-100):
 - STAR Structure: Does the answer follow Situation → Task → Action → Result?
 - Relevance: Does it directly address the question?
 - Specificity: Are there concrete examples, not vague generalizations?
 - Impact: Does the candidate show measurable results or clear outcomes?
 - Keywords: Does it include relevant terms like ${keywords?.join(', ') || 'key competencies'}?
 
 ### Delivery Score (0-100):
 - Eye contact and engagement with camera
 - Confident posture and body language
 - Clear, well-paced speech
 - Appropriate emotional expression
 - Professional gestures
 
 ### STAR Breakdown (0-100 each):
 - Situation: Clear context setting
 - Task: Well-defined objective/challenge
 - Action: Specific steps taken by the candidate (not the team)
 - Result: Quantifiable outcomes or lessons learned
 
 Be ENCOURAGING but HONEST. Focus on specific improvements.
 
 Respond with valid JSON:
 {
   "contentScore": <number 0-100>,
   "deliveryScore": <number 0-100>,
   "overallScore": <number 0-100>,
   "starBreakdown": {
     "situation": <number 0-100>,
     "task": <number 0-100>,
     "action": <number 0-100>,
     "result": <number 0-100>
   },
   "strengths": ["<strength 1>", "<strength 2>"],
   "improvements": ["<specific improvement>"],
   "feedback": "<2-3 encouraging sentences with one actionable tip>",
   "quickTip": "<one specific 5-7 word improvement suggestion>"
 }`
           },
           {
             role: 'user',
             content: `Evaluate this HR/Behavioral interview answer:
 
 **Category:** ${category}
 **Question:** "${question}"
 ${idealAnswer ? `**Ideal Answer Reference:** "${idealAnswer}"` : ''}
 
 **Candidate's Answer:** "${answer}"
 
 ${deliveryContext}
 
 Provide encouraging, specific feedback for this behavioral interview response.`
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
     
     // Parse JSON from response
     let evaluation;
     try {
       const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                         content.match(/```\s*([\s\S]*?)\s*```/);
       const jsonStr = jsonMatch ? jsonMatch[1] : content;
       evaluation = JSON.parse(jsonStr.trim());
     } catch (parseError) {
       console.error('JSON parse error:', parseError, 'Content:', content);
       // Fallback structure
       evaluation = {
         contentScore: 60,
         deliveryScore: visionMetrics ? Math.round((visionMetrics.eyeContact + visionMetrics.posture + visionMetrics.bodyLanguage) / 3) : 60,
         overallScore: 60,
         starBreakdown: { situation: 50, task: 50, action: 50, result: 50 },
         strengths: ["Good effort in answering the question"],
         improvements: ["Try using the STAR method for more structure"],
         feedback: "Good attempt! Try to include more specific examples using the STAR format - describe the Situation, Task, Action, and Result.",
         quickTip: "Add specific examples with measurable results"
       };
     }
 
     console.log('HR Answer evaluation:', { question: question.slice(0, 50), overallScore: evaluation.overallScore });
 
     return new Response(JSON.stringify(evaluation), {
       headers: { ...corsHeaders, 'Content-Type': 'application/json' },
     });
 
   } catch (error) {
     console.error('Error in evaluate-hr-answer:', error);
     return new Response(
       JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
       {
         status: 500,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       }
     );
   }
 });