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

  // Calculate overall metrics
  const avgOverallScore = Math.round(
    results.reduce((sum, r) => sum + (r.evaluation?.overallScore || 0), 0) / results.length
  );
  const avgContentScore = Math.round(
    results.reduce((sum, r) => sum + (r.evaluation?.contentScore || 0), 0) / results.length
  );
  const avgDeliveryScore = Math.round(
    results.reduce((sum, r) => sum + (r.evaluation?.deliveryScore || 0), 0) / results.length
  );

  // Delivery metrics averages
  const avgEyeContact = Math.round(results.reduce((s, r) => s + (r.avgMetrics?.eyeContact || 0), 0) / results.length);
  const avgPosture = Math.round(results.reduce((s, r) => s + (r.avgMetrics?.posture || 0), 0) / results.length);
  const avgBodyLanguage = Math.round(results.reduce((s, r) => s + (r.avgMetrics?.bodyLanguage || 0), 0) / results.length);
  const avgFacialExpression = Math.round(results.reduce((s, r) => s + (r.avgMetrics?.facialExpression || 0), 0) / results.length);

  // STAR average
  const avgStar = {
    situation: Math.round(results.reduce((sum, r) => sum + (r.evaluation?.starBreakdown?.situation || 0), 0) / results.length),
    task: Math.round(results.reduce((sum, r) => sum + (r.evaluation?.starBreakdown?.task || 0), 0) / results.length),
    action: Math.round(results.reduce((sum, r) => sum + (r.evaluation?.starBreakdown?.action || 0), 0) / results.length),
    result: Math.round(results.reduce((sum, r) => sum + (r.evaluation?.starBreakdown?.result || 0), 0) / results.length),
  };

  // Emotion distribution
  const allEmotions = results.flatMap(r => r.emotionHistory);
  const emotionCounts: Record<string, number> = {};
  allEmotions.forEach(e => {
    if (e) emotionCounts[e] = (emotionCounts[e] || 0) + 1;
  });
  const emotionData = Object.entries(emotionCounts).map(([name, value]) => ({ 
    name: name.charAt(0).toUpperCase() + name.slice(1), 
    value 
  }));

  // STAR radar data
  const starRadarData = [
    { subject: 'Situation', score: avgStar.situation, fullMark: 100 },
    { subject: 'Task', score: avgStar.task, fullMark: 100 },
    { subject: 'Action', score: avgStar.action, fullMark: 100 },
    { subject: 'Result', score: avgStar.result, fullMark: 100 },
  ];

  // Per-question bar chart data
  const questionBarData = results.map((r, i) => ({
    name: `Q${i + 1}`,
    content: r.evaluation?.contentScore || 0,
    delivery: r.evaluation?.deliveryScore || 0,
    overall: r.evaluation?.overallScore || 0,
  }));

  // Delivery metrics data
  const deliveryRadarData = [
    { subject: 'Eye Contact', score: avgEyeContact, fullMark: 100 },
    { subject: 'Posture', score: avgPosture, fullMark: 100 },
    { subject: 'Body Language', score: avgBodyLanguage, fullMark: 100 },
    { subject: 'Expression', score: avgFacialExpression, fullMark: 100 },
  ];

  // Categories covered
  const categories = [...new Set(results.map(r => r.category))];

  // Collect all strengths and improvements with frequency
  const strengthCounts: Record<string, number> = {};
  const improvementCounts: Record<string, number> = {};
  results.forEach(r => {
    (r.evaluation?.strengths || []).forEach(s => { strengthCounts[s] = (strengthCounts[s] || 0) + 1; });
    (r.evaluation?.improvements || []).forEach(imp => { improvementCounts[imp] = (improvementCounts[imp] || 0) + 1; });
  });
  const rankedStrengths = Object.entries(strengthCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rankedImprovements = Object.entries(improvementCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const EMOTION_COLORS: Record<string, string> = {
    Happy: 'hsl(var(--accent))',
    Confident: 'hsl(142, 76%, 45%)',
    Neutral: 'hsl(var(--muted-foreground))',
    Nervous: 'hsl(38, 92%, 50%)',
    Stressed: 'hsl(var(--destructive))',
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-accent';
    if (score >= 40) return 'text-yellow-400';
    return 'text-destructive';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-400/10 border-green-400/30';
    if (score >= 60) return 'bg-accent/10 border-accent/30';
    if (score >= 40) return 'bg-yellow-400/10 border-yellow-400/30';
    return 'bg-destructive/10 border-destructive/30';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Exceptional';
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Satisfactory';
    if (score >= 50) return 'Needs Work';
    return 'Keep Practicing';
  };

  const getScoreEmoji = (score: number) => {
    if (score >= 80) return '🏆';
    if (score >= 60) return '👍';
    if (score >= 40) return '💪';
    return '📚';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleQuestion = (index: number) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const exportToPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    const addPageIfNeeded = (neededSpace: number) => {
      if (y + neededSpace > 270) {
        doc.addPage();
        y = 20;
      }
    };

    // Title
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("HR Interview Performance Report", margin, y);
    y += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleDateString()} | Duration: ${formatDuration(totalDuration)} | Questions: ${results.length}`, margin, y);
    y += 12;

    // Line separator
    doc.setDrawColor(150);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Overall Score
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Overall Score: ${avgOverallScore}% - ${getScoreLabel(avgOverallScore)}`, margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Content Quality: ${avgContentScore}%  |  Delivery & Presence: ${avgDeliveryScore}%`, margin, y);
    y += 12;

    // STAR Method Scores
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("STAR Method Analysis", margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Situation: ${avgStar.situation}%  |  Task: ${avgStar.task}%  |  Action: ${avgStar.action}%  |  Result: ${avgStar.result}%`, margin, y);
    y += 12;

    // Delivery Metrics
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Delivery Metrics", margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Eye Contact: ${avgEyeContact}%  |  Posture: ${avgPosture}%  |  Body Language: ${avgBodyLanguage}%  |  Expression: ${avgFacialExpression}%`, margin, y);
    y += 14;

    // Top Strengths
    addPageIfNeeded(40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Top Strengths", margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    if (rankedStrengths.length > 0) {
      rankedStrengths.forEach(([strength, count]) => {
        addPageIfNeeded(8);
        const lines = doc.splitTextToSize(`✓ ${strength} (mentioned ${count}x)`, contentWidth);
        doc.text(lines, margin, y);
        y += lines.length * 5 + 2;
      });
    } else {
      doc.text("Complete more questions with detailed answers to identify strengths.", margin, y);
      y += 6;
    }
    y += 6;

    // Areas to Improve
    addPageIfNeeded(40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Areas to Improve", margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    if (rankedImprovements.length > 0) {
      rankedImprovements.forEach(([improvement, count]) => {
        addPageIfNeeded(8);
        const lines = doc.splitTextToSize(`→ ${improvement} (mentioned ${count}x)`, contentWidth);
        doc.text(lines, margin, y);
        y += lines.length * 5 + 2;
      });
    } else {
      doc.text("No specific improvements identified. Keep up the great work!", margin, y);
      y += 6;
    }
    y += 8;

    // Categories
    addPageIfNeeded(20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Categories Covered", margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(categories.join(", "), margin, y);
    y += 12;

    // Question-by-Question Breakdown
    addPageIfNeeded(20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Question-by-Question Breakdown", margin, y);
    y += 10;

    results.forEach((result, index) => {
      addPageIfNeeded(50);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      const qLines = doc.splitTextToSize(`Q${index + 1}. [${result.category}] ${result.question}`, contentWidth);
      doc.text(qLines, margin, y);
      y += qLines.length * 5 + 3;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Score: ${result.evaluation?.overallScore || 0}%  |  Content: ${result.evaluation?.contentScore || 0}%  |  Delivery: ${result.evaluation?.deliveryScore || 0}%`, margin, y);
      y += 6;

      if (result.evaluation?.starBreakdown) {
        const sb = result.evaluation.starBreakdown;
        doc.text(`STAR: S:${sb.situation}% T:${sb.task}% A:${sb.action}% R:${sb.result}%`, margin, y);
        y += 6;
      }

      if (result.evaluation?.feedback) {
        const fbLines = doc.splitTextToSize(`Feedback: ${result.evaluation.feedback}`, contentWidth);
        doc.text(fbLines, margin, y);
        y += fbLines.length * 4 + 2;
      }

      if (result.evaluation?.quickTip) {
        doc.text(`💡 Tip: ${result.evaluation.quickTip}`, margin, y);
        y += 6;
      }

      if (result.answer) {
        addPageIfNeeded(20);
        const ansLines = doc.splitTextToSize(`Your Answer: "${result.answer.slice(0, 300)}${result.answer.length > 300 ? '...' : ''}"`, contentWidth);
        doc.setFont("helvetica", "italic");
        doc.text(ansLines, margin, y);
        doc.setFont("helvetica", "normal");
        y += ansLines.length * 4 + 4;
      }

      y += 6;
    });

    doc.save("hr-interview-report.pdf");
    toast({ title: "PDF Downloaded", description: "Your full interview report has been saved" });
  };

  const TabButton = ({ tab, label, icon: Icon }: { tab: typeof activeTab; label: string; icon: any }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        activeTab === tab
          ? 'bg-primary text-primary-foreground shadow-lg'
          : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">{getScoreEmoji(avgOverallScore)}</div>
          <h1 className="text-3xl font-bold mb-2">HR Interview Complete!</h1>
          <p className="text-muted-foreground">
            Behavioral interview performance summary
          </p>
        </div>

        {/* Overall Score Card */}
        <Card className="p-8 bg-gradient-card border-border mb-8 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center">
              <div className={`text-7xl font-bold ${getScoreColor(avgOverallScore)} transition-all`}>
                {avgOverallScore}%
              </div>
              <div className="text-xl text-muted-foreground mt-2">
                {getScoreLabel(avgOverallScore)}
              </div>
              <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                <Badge variant="outline" className="text-sm gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {results.length} Questions
                </Badge>
                <Badge variant="outline" className="text-sm gap-1">
                  <Activity className="w-3 h-3" />
                  {formatDuration(totalDuration)}
                </Badge>
                <Badge variant="outline" className="text-sm gap-1">
                  <Brain className="w-3 h-3" />
                  {categories.length} Categories
                </Badge>
              </div>
            </div>

            <div className="flex-1 w-full max-w-md space-y-4">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Content Quality</span>
                  <span className={`text-sm font-semibold ${getScoreColor(avgContentScore)}`}>{avgContentScore}%</span>
                </div>
                <Progress value={avgContentScore} className="h-2.5" />
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Delivery & Presence</span>
                  <span className={`text-sm font-semibold ${getScoreColor(avgDeliveryScore)}`}>{avgDeliveryScore}%</span>
                </div>
                <Progress value={avgDeliveryScore} className="h-2.5" />
              </div>
            </div>
          </div>
        </Card>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <TabButton tab="overview" label="Overview" icon={BarChart3} />
          <TabButton tab="questions" label="Questions" icon={MessageSquare} />
          <TabButton tab="delivery" label="Delivery" icon={Eye} />
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* STAR & Emotion Charts */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 bg-gradient-card border-border">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  STAR Method Analysis
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={starRadarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Radar name="Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {Object.entries(avgStar).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm p-2 rounded-md bg-secondary/30">
                      <span className="capitalize text-muted-foreground">{key}</span>
                      <span className={`font-semibold ${getScoreColor(value)}`}>{value}%</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Smile className="w-5 h-5 text-accent" />
                  Emotion Distribution
                </h3>
                {emotionData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={emotionData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {emotionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={EMOTION_COLORS[entry.name] || 'hsl(var(--muted-foreground))'} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Meh className="w-10 h-10 opacity-40" />
                    <p className="text-sm">No emotion data recorded</p>
                    <p className="text-xs">Ensure camera is active during the interview</p>
                  </div>
                )}
              </Card>
            </div>

            {/* Strengths & Improvements */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 bg-gradient-card border-border">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  <h4 className="text-lg font-bold">Top Strengths</h4>
                  {rankedStrengths.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">{rankedStrengths.length} found</Badge>
                  )}
                </div>
                {rankedStrengths.length > 0 ? (
                  <ul className="space-y-3">
                    {rankedStrengths.map(([strength, count], i) => (
                      <li key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-green-400/5 border border-green-400/10">
                        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="text-sm">{strength}</span>
                          {count > 1 && (
                            <span className="text-xs text-green-400/70 ml-2">×{count}</span>
                          )}
                        </div>
                        <div className="flex gap-0.5">
                          {Array.from({ length: Math.min(count, 5) }).map((_, j) => (
                            <Star key={j} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Sparkles className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">Strengths are being analyzed</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Try answering with the STAR method — specific examples help the AI identify your key strengths
                    </p>
                  </div>
                )}
              </Card>

              <Card className="p-6 bg-gradient-card border-border">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h4 className="text-lg font-bold">Areas to Improve</h4>
                  {rankedImprovements.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">{rankedImprovements.length} found</Badge>
                  )}
                </div>
                {rankedImprovements.length > 0 ? (
                  <ul className="space-y-3">
                    {rankedImprovements.map(([improvement, count], i) => (
                      <li key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-accent/5 border border-accent/10">
                        <Zap className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="text-sm">{improvement}</span>
                          {count > 1 && (
                            <span className="text-xs text-accent/70 ml-2">×{count}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ThumbsUp className="w-10 h-10 text-green-400/30 mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">No specific improvements flagged!</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Great performance — keep practicing to maintain your skills
                    </p>
                  </div>
                )}
              </Card>
            </div>

            {/* Score Comparison Bar Chart */}
            <Card className="p-6 bg-gradient-card border-border">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Score Comparison by Question
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={questionBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="content" name="Content" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="delivery" name="Delivery" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Categories */}
            <Card className="p-6 bg-gradient-card border-border">
              <h3 className="text-lg font-semibold mb-4">Categories Covered</h3>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat, i) => (
                  <Badge key={i} variant="secondary" className="text-primary text-sm px-3 py-1">{cat}</Badge>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* QUESTIONS TAB */}
        {activeTab === 'questions' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {results.map((result, index) => (
              <Collapsible
                key={index}
                open={expandedQuestions.has(index)}
                onOpenChange={() => toggleQuestion(index)}
              >
                <Card className={`bg-gradient-card border-border overflow-hidden transition-all ${expandedQuestions.has(index) ? 'ring-1 ring-primary/30' : ''}`}>
                  <CollapsibleTrigger className="w-full">
                    <div className="p-4 flex items-center justify-between gap-4 hover:bg-secondary/20 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3 flex-1 text-left">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold border ${getScoreBg(result.evaluation?.overallScore || 0)}`}>
                          {result.evaluation?.overallScore || 0}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">{result.category}</Badge>
                            <span className="text-xs text-muted-foreground">Q{index + 1}</span>
                          </div>
                          <p className="text-sm font-medium truncate">{result.question}</p>
                        </div>
                      </div>
                      {expandedQuestions.has(index) ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                      {/* Score Breakdown */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-secondary/30 text-center">
                          <div className={`text-xl font-bold ${getScoreColor(result.evaluation?.contentScore || 0)}`}>
                            {result.evaluation?.contentScore || 0}%
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Content</div>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30 text-center">
                          <div className={`text-xl font-bold ${getScoreColor(result.evaluation?.deliveryScore || 0)}`}>
                            {result.evaluation?.deliveryScore || 0}%
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Delivery</div>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary/30 text-center">
                          <div className={`text-xl font-bold ${getScoreColor(result.evaluation?.overallScore || 0)}`}>
                            {result.evaluation?.overallScore || 0}%
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Overall</div>
                        </div>
                      </div>

                      {/* STAR Breakdown */}
                      {result.evaluation?.starBreakdown && (
                        <div className="grid grid-cols-4 gap-2">
                          {Object.entries(result.evaluation.starBreakdown).map(([key, val]) => (
                            <div key={key} className="text-center">
                              <div className={`text-sm font-semibold ${getScoreColor(val)}`}>{val}%</div>
                              <div className="text-xs text-muted-foreground capitalize">{key}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Feedback */}
                      {result.evaluation?.feedback && (
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                          <p className="text-sm text-foreground">{result.evaluation.feedback}</p>
                        </div>
                      )}

                      {/* Quick Tip */}
                      {result.evaluation?.quickTip && (
                        <div className="flex items-center gap-2 text-sm text-accent">
                          <Zap className="w-4 h-4" />
                          <span className="font-medium">{result.evaluation.quickTip}</span>
                        </div>
                      )}

                      {/* Answer Preview */}
                      {result.answer && (
                        <div className="p-3 rounded-lg bg-secondary/20">
                          <p className="text-xs text-muted-foreground mb-1 font-medium">Your Answer:</p>
                          <p className="text-sm text-foreground/80 italic">
                            "{result.answer.length > 200 ? result.answer.slice(0, 200) + '...' : result.answer}"
                          </p>
                        </div>
                      )}

                      {/* Per-question strengths & improvements */}
                      <div className="grid grid-cols-2 gap-3">
                        {(result.evaluation?.strengths || []).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-green-400 mb-1.5">Strengths</p>
                            {result.evaluation!.strengths.map((s, i) => (
                              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1 mb-1">
                                <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />{s}
                              </p>
                            ))}
                          </div>
                        )}
                        {(result.evaluation?.improvements || []).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-accent mb-1.5">Improve</p>
                            {result.evaluation!.improvements.map((imp, i) => (
                              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1 mb-1">
                                <AlertCircle className="w-3 h-3 text-accent flex-shrink-0 mt-0.5" />{imp}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
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
                        <span className="text-sm flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</span>
                        <span className={`text-sm font-semibold ${getScoreColor(value)}`}>{value}%</span>
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
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8 mb-4">
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
