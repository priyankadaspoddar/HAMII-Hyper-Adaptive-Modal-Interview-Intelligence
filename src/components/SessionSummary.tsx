import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Loader2, Sparkles, Trophy, Target, TrendingUp, 
  CheckCircle, AlertTriangle, Lightbulb, Heart 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface QuestionResult {
  question: {
    question: string;
    category: string;
  };
  answer: string;
  evaluation: {
    contentScore: number;
    deliveryScore: number;
    overallScore: number;
    strengths: string[];
    improvements: string[];
  } | null;
  metrics: {
    eyeContact: number;
    posture: number;
    speechClarity: number;
    bodyLanguage: number;
  } | null;
}

interface SessionSummaryData {
  executiveSummary: string;
  performanceRating: string;
  topStrengths: string[];
  priorityImprovements: string[];
  deliveryAnalysis: string;
  contentQuality: string;
  actionPlan: string[];
  motivationalNote: string;
}

interface SessionSummaryProps {
  results: QuestionResult[];
  candidateName?: string;
}

const getRatingColor = (rating: string) => {
  switch (rating?.toLowerCase()) {
    case 'excellent': return 'text-green-400';
    case 'strong': return 'text-emerald-400';
    case 'competent': return 'text-blue-400';
    case 'developing': return 'text-yellow-400';
    default: return 'text-orange-400';
  }
};

const getRatingIcon = (rating: string) => {
  switch (rating?.toLowerCase()) {
    case 'excellent':
    case 'strong':
      return <Trophy className="w-5 h-5" />;
    default:
      return <Target className="w-5 h-5" />;
  }
};

export const SessionSummary = ({ results, candidateName }: SessionSummaryProps) => {
  const [summary, setSummary] = useState<SessionSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const generateSummary = async () => {
    if (results.length === 0) {
      toast({ title: "No Results", description: "Complete the interview first", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Calculate average metrics
      const validResults = results.filter(r => r.metrics);
      const avgMetrics = {
        avgEyeContact: validResults.length > 0 
          ? Math.round(validResults.reduce((s, r) => s + (r.metrics?.eyeContact || 0), 0) / validResults.length) 
          : 0,
        avgPosture: validResults.length > 0 
          ? Math.round(validResults.reduce((s, r) => s + (r.metrics?.posture || 0), 0) / validResults.length) 
          : 0,
        avgSpeechClarity: validResults.length > 0 
          ? Math.round(validResults.reduce((s, r) => s + (r.metrics?.speechClarity || 0), 0) / validResults.length) 
          : 0,
        avgBodyLanguage: validResults.length > 0 
          ? Math.round(validResults.reduce((s, r) => s + (r.metrics?.bodyLanguage || 0), 0) / validResults.length) 
          : 0,
        avgOverallScore: results.length > 0 
          ? Math.round(results.reduce((s, r) => s + (r.evaluation?.overallScore || 0), 0) / results.length) 
          : 0,
      };

      // Format results for the API
      const formattedResults = results.map(r => ({
        question: r.question.question,
        category: r.question.category,
        answer: r.answer,
        contentScore: r.evaluation?.contentScore || 0,
        deliveryScore: r.evaluation?.deliveryScore || 0,
        overallScore: r.evaluation?.overallScore || 0,
        strengths: r.evaluation?.strengths || [],
        improvements: r.evaluation?.improvements || [],
      }));

      const { data, error: fnError } = await supabase.functions.invoke('summarize-interview-session', {
        body: { results: formattedResults, metrics: avgMetrics, candidateName }
      });

      if (fnError) throw fnError;
      setSummary(data);
      
      toast({ title: "Summary Generated!", description: "Your session recap is ready" });
    } catch (err: any) {
      console.error("Summary generation error:", err);
      setError(err.message || "Failed to generate summary");
      toast({ title: "Error", description: err.message || "Could not generate summary", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!summary) {
    return (
      <Card className="p-6 bg-gradient-card border-border mb-6">
        <div className="text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h3 className="text-xl font-bold mb-2">AI Session Recap</h3>
          <p className="text-muted-foreground mb-4">
            Get a comprehensive summary of your interview performance with personalized insights and action items.
          </p>
          <Button onClick={generateSummary} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing Session...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Session Recap
              </>
            )}
          </Button>
          {error && <p className="text-destructive text-sm mt-2">{error}</p>}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 mb-6">
      {/* Executive Summary Card */}
      <Card className="p-6 bg-gradient-card border-border overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-full bg-primary/20 ${getRatingColor(summary.performanceRating)}`}>
              {getRatingIcon(summary.performanceRating)}
            </div>
            <div>
              <h3 className="text-xl font-bold">Session Recap</h3>
              <p className={`font-semibold ${getRatingColor(summary.performanceRating)}`}>
                Performance: {summary.performanceRating}
              </p>
            </div>
          </div>
          
          <p className="text-foreground leading-relaxed">{summary.executiveSummary}</p>
        </div>
      </Card>

      {/* Strengths & Improvements Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Strengths */}
        <Card className="p-6 bg-gradient-card border-border">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h4 className="text-lg font-bold text-green-500">Top Strengths</h4>
          </div>
          <ul className="space-y-3">
            {summary.topStrengths.map((strength, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span className="text-sm text-foreground">{strength}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Priority Improvements */}
        <Card className="p-6 bg-gradient-card border-border">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h4 className="text-lg font-bold text-orange-500">Priority Improvements</h4>
          </div>
          <ul className="space-y-3">
            {summary.priorityImprovements.map((improvement, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">→</span>
                <span className="text-sm text-foreground">{improvement}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Delivery & Content Analysis */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 bg-gradient-card border-border">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h4 className="text-lg font-bold">Delivery Analysis</h4>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{summary.deliveryAnalysis}</p>
        </Card>

        <Card className="p-6 bg-gradient-card border-border">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-accent" />
            <h4 className="text-lg font-bold">Content Quality</h4>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{summary.contentQuality}</p>
        </Card>
      </div>

      {/* Action Plan */}
      <Card className="p-6 bg-gradient-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-primary" />
          <h4 className="text-lg font-bold">Action Plan</h4>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {summary.actionPlan.map((action, i) => (
            <div key={i} className="p-4 bg-background/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-xs text-muted-foreground">Step {i + 1}</span>
              </div>
              <p className="text-sm text-foreground">{action}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Motivational Note */}
      <Card className="p-6 bg-primary/10 border-primary/20">
        <div className="flex items-start gap-3">
          <Heart className="w-5 h-5 text-primary mt-0.5" />
          <p className="text-foreground italic">{summary.motivationalNote}</p>
        </div>
      </Card>
    </div>
  );
};
