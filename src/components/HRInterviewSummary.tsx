import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Trophy, Target, TrendingUp, ArrowRight, Download, RefreshCw,
  Smile, Meh, Frown, ThumbsUp, AlertCircle, CheckCircle,
  ChevronDown, ChevronUp, Star, Zap, MessageSquare, Eye,
  Activity, Brain, Sparkles, BarChart3
} from "lucide-react";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { useToast } from "@/components/ui/use-toast";
import jsPDF from "jspdf";

interface HRQuestionResult {
  question: string;
  category: string;
  answer: string;
  evaluation: {
    contentScore: number;
    deliveryScore: number;
    overallScore: number;
    starBreakdown: { situation: number; task: number; action: number; result: number };
    strengths: string[];
    improvements: string[];
    feedback: string;
    quickTip: string;
  } | null;
  emotionHistory: string[];
  avgMetrics: {
    eyeContact: number;
    posture: number;
    bodyLanguage: number;
    facialExpression: number;
  };
}

interface HRInterviewSummaryProps {
  results: HRQuestionResult[];
  totalDuration: number;
  onRestart: () => void;
  onGoHome: () => void;
}

const HRInterviewSummary = ({ results, totalDuration, onRestart, onGoHome }: HRInterviewSummaryProps) => {
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'delivery'>('overview');
  const { toast } = useToast();

  // Guard against empty results
  if (!results || results.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full p-8 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-2xl font-bold mb-2">No interview data available</h2>
          <p className="text-muted-foreground mb-6">
            Please complete at least one question to see the summary.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button onClick={onRestart}>Start New Practice</Button>
            <Button variant="outline" onClick={onGoHome}>Back to Home</Button>
          </div>
        </Card>
      </div>
    );
  }

  // Calculate overall metrics (safe averaging)
  const safeAvg = (values: number[]) => {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  };

  const avgOverallScore = safeAvg(results.map(r => r.evaluation?.overallScore || 0));
  const avgContentScore = safeAvg(results.map(r => r.evaluation?.contentScore || 0));
  const avgDeliveryScore = safeAvg(results.map(r => r.evaluation?.deliveryScore || 0));

  // Delivery metrics averages
  const avgEyeContact = safeAvg(results.map(r => r.avgMetrics?.eyeContact || 0));
  const avgPosture = safeAvg(results.map(r => r.avgMetrics?.posture || 0));
  const avgBodyLanguage = safeAvg(results.map(r => r.avgMetrics?.bodyLanguage || 0));
  const avgFacialExpression = safeAvg(results.map(r => r.avgMetrics?.facialExpression || 0));

  // STAR average
  const avgStar = {
    situation: safeAvg(results.map(r => r.evaluation?.starBreakdown?.situation || 0)),
    task: safeAvg(results.map(r => r.evaluation?.starBreakdown?.task || 0)),
    action: safeAvg(results.map(r => r.evaluation?.starBreakdown?.action || 0)),
    result: safeAvg(results.map(r => r.evaluation?.starBreakdown?.result || 0)),
  };

  // Emotion distribution
  const allEmotions = results.flatMap(r => r.emotionHistory || []);
  const emotionCounts: Record<string, number> = {};
  allEmotions.forEach(e => {
    if (e) emotionCounts[e] = (emotionCounts[e] || 0) + 1;
  });

  const emotionData = Object.entries(emotionCounts).map(([name, value]) => ({
    name,
    value,
    fill: name === 'happy' ? '#10b981' :
         name === 'neutral' ? '#6b7280' :
         name === 'sad' ? '#ef4444' :
         name === 'angry' ? '#f97316' :
         name === 'surprised' ? '#8b5cf6' : '#64748b'
  }));

  // Radar chart data
  const deliveryRadarData = [
    { subject: 'Eye Contact', score: avgEyeContact },
    { subject: 'Posture', score: avgPosture },
    { subject: 'Body Language', score: avgBodyLanguage },
    { subject: 'Facial Expression', score: avgFacialExpression },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-500";
    if (score >= 70) return "text-emerald-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const exportToPdf = () => {
    const doc = new jsPDF();
    let y = 20;

    doc.setFontSize(18);
    doc.text("HR Interview Performance Report", 20, y);
    y += 10;

    doc.setFontSize(12);
    doc.text(`Total Duration: ${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s`, 20, y);
    y += 10;

    doc.text(`Overall Score: ${avgOverallScore}%`, 20, y);
    y += 8;
    doc.text(`Content Score: ${avgContentScore}%`, 20, y);
    y += 8;
    doc.text(`Delivery Score: ${avgDeliveryScore}%`, 20, y);
    y += 15;

    // Add more sections as needed...

    doc.save("interview-report.pdf");
    toast({ title: "PDF Report Downloaded" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold">Interview Summary</h1>
            <p className="text-muted-foreground">
              {results.length} {results.length === 1 ? "question" : "questions"} • {Math.floor(totalDuration / 60)}m {totalDuration % 60}s
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportToPdf} className="gap-2">
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
            <Button onClick={onRestart} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Practice Again
            </Button>
            <Button variant="ghost" onClick={onGoHome}>
              Back to Home
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b mb-6">
          {(['overview', 'questions', 'delivery'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === tab 
                  ? "border-b-2 border-primary text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {/* Overall Score Card */}
            <Card className="p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                Overall Performance
              </h3>
              <div className="text-center py-6">
                <div className="text-6xl font-bold mb-2">{avgOverallScore}%</div>
                <p className={`text-xl font-medium ${getScoreColor(avgOverallScore)}`}>
                  {avgOverallScore >= 85 ? "Excellent" : 
                   avgOverallScore >= 70 ? "Strong" : 
                   avgOverallScore >= 50 ? "Developing" : "Needs Improvement"}
                </p>
              </div>
            </Card>

            {/* Content & Delivery */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Content vs Delivery</h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span>Content Quality</span>
                    <span className={getScoreColor(avgContentScore)}>{avgContentScore}%</span>
                  </div>
                  <Progress value={avgContentScore} className="h-3" />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span>Delivery & Presence</span>
                    <span className={getScoreColor(avgDeliveryScore)}>{avgDeliveryScore}%</span>
                  </div>
                  <Progress value={avgDeliveryScore} className="h-3" />
                </div>
              </div>
            </Card>

            {/* Emotion Distribution */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Brain className="w-5 h-5 text-accent" />
                Emotional Presence
              </h3>
              <div className="h-64">
                {emotionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={emotionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {emotionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <Meh className="w-12 h-12 opacity-40" />
                    <p className="text-sm font-medium">No emotion data recorded</p>
                    <p className="text-xs">Camera was likely off or no faces detected</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* QUESTIONS TAB */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            {results.map((result, index) => (
              <Collapsible
                key={index}
                open={expandedQuestions.has(index)}
                onOpenChange={() => {
                  const newSet = new Set(expandedQuestions);
                  if (newSet.has(index)) {
                    newSet.delete(index);
                  } else {
                    newSet.add(index);
                  }
                  setExpandedQuestions(newSet);
                }}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="p-5 flex justify-between items-center cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{result.category}</Badge>
                          <h4 className="font-medium">{result.question}</h4>
                        </div>
                        {result.evaluation && (
                          <div className="mt-2 flex items-center gap-4 text-sm">
                            <span className={getScoreColor(result.evaluation.overallScore)}>
                              {result.evaluation.overallScore}% overall
                            </span>
                            <span className="text-muted-foreground">
                              {result.answer.split(" ").slice(0, 12).join(" ")}...
                            </span>
                          </div>
                        )}
                      </div>
                      {expandedQuestions.has(index) ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="p-6 pt-2 border-t">
                      {result.evaluation ? (
                        <div className="space-y-6">
                          {/* Feedback content */}
                          <div>
                            <h5 className="font-semibold mb-2">Feedback</h5>
                            <p className="text-sm text-muted-foreground">{result.evaluation.feedback}</p>
                          </div>

                          {/* STAR breakdown */}
                          <div>
                            <h5 className="font-semibold mb-3">STAR Structure</h5>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                              {Object.entries(result.evaluation.starBreakdown).map(([key, value]) => (
                                <div key={key} className="text-center">
                                  <div className="text-2xl font-bold">{value}%</div>
                                  <div className="text-xs uppercase text-muted-foreground">{key}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Strengths & Improvements */}
                          <div className="grid md:grid-cols-2 gap-6">
                            <div>
                              <h5 className="font-semibold mb-2 flex items-center gap-2 text-green-600">
                                <CheckCircle className="w-4 h-4" />
                                Strengths
                              </h5>
                              <ul className="space-y-1 text-sm">
                                {result.evaluation.strengths.map((s, i) => (
                                  <li key={i}>• {s}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h5 className="font-semibold mb-2 flex items-center gap-2 text-amber-600">
                                <AlertCircle className="w-4 h-4" />
                                Areas to Improve
                              </h5>
                              <ul className="space-y-1 text-sm">
                                {result.evaluation.improvements.map((i, idx) => (
                                  <li key={idx}>• {i}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-muted-foreground">
                          Evaluation not available for this response
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}

        {/* DELIVERY TAB */}
        {activeTab === 'delivery' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 bg-gradient-card border-border">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  Delivery Metrics Radar
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={deliveryRadarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Radar name="Score" dataKey="score" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.35} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-accent" />
                  Delivery Breakdown
                </h3>
                <div className="space-y-5">
                  {[
                    { label: 'Eye Contact', value: avgEyeContact, icon: Eye },
                    { label: 'Posture', value: avgPosture, icon: Activity },
                    { label: 'Body Language', value: avgBodyLanguage, icon: Zap },
                    { label: 'Facial Expression', value: avgFacialExpression, icon: Smile },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" />{label}
                        </span>
                        <span className={`text-sm font-semibold ${getScoreColor(value)}`}>
                          {value}%
                        </span>
                      </div>
                      <Progress value={value} className="h-2" />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10 mb-6">
          <Button onClick={exportToPdf} size="lg" variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Download PDF Report
          </Button>
          <Button onClick={onRestart} size="lg" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Practice Again
          </Button>
          <Button onClick={onGoHome} variant="outline" size="lg" className="gap-2">
            <ArrowRight className="w-4 h-4" />
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HRInterviewSummary;
