 import { Card } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Progress } from "@/components/ui/progress";
 import { Badge } from "@/components/ui/badge";
 import { 
   Trophy, Target, TrendingUp, ArrowRight, Download, RefreshCw,
   Smile, Meh, Frown, ThumbsUp, AlertCircle, CheckCircle
 } from "lucide-react";
 import { 
   PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
   RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
 } from "recharts";
 
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
 
   // Categories covered
   const categories = [...new Set(results.map(r => r.category))];
 
   // Collect all strengths and improvements
   const allStrengths = results.flatMap(r => r.evaluation?.strengths || []);
   const allImprovements = results.flatMap(r => r.evaluation?.improvements || []);
   const uniqueStrengths = [...new Set(allStrengths)].slice(0, 4);
   const uniqueImprovements = [...new Set(allImprovements)].slice(0, 4);
 
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
 
   const getScoreLabel = (score: number) => {
     if (score >= 90) return 'Exceptional';
     if (score >= 80) return 'Excellent';
     if (score >= 70) return 'Good';
     if (score >= 60) return 'Satisfactory';
     if (score >= 50) return 'Needs Work';
     return 'Keep Practicing';
   };
 
   const formatDuration = (seconds: number) => {
     const mins = Math.floor(seconds / 60);
     const secs = seconds % 60;
     return `${mins}:${secs.toString().padStart(2, '0')}`;
   };
 
   return (
     <div className="min-h-screen bg-gradient-hero p-4">
       <div className="container mx-auto max-w-6xl">
         <div className="text-center mb-8">
           <h1 className="text-3xl font-bold mb-2">HR Interview Complete! 🎉</h1>
           <p className="text-muted-foreground">
             Here's your behavioral interview performance summary
           </p>
         </div>
 
         {/* Overall Score Card */}
         <Card className="p-8 bg-gradient-card border-border mb-8">
           <div className="flex flex-col md:flex-row items-center justify-between gap-8">
             <div className="text-center">
               <div className={`text-7xl font-bold ${getScoreColor(avgOverallScore)}`}>
                 {avgOverallScore}%
               </div>
               <div className="text-xl text-muted-foreground mt-2">
                 {getScoreLabel(avgOverallScore)}
               </div>
               <div className="flex items-center justify-center gap-4 mt-4">
                 <Badge variant="outline" className="text-sm">
                   {results.length} Questions
                 </Badge>
                 <Badge variant="outline" className="text-sm">
                   {formatDuration(totalDuration)} Duration
                 </Badge>
               </div>
             </div>
 
             <div className="flex-1 w-full max-w-md">
               <div className="space-y-4">
                 <div>
                   <div className="flex justify-between mb-1">
                     <span className="text-sm">Content Quality</span>
                     <span className={`text-sm font-medium ${getScoreColor(avgContentScore)}`}>
                       {avgContentScore}%
                     </span>
                   </div>
                   <Progress value={avgContentScore} className="h-2" />
                 </div>
                 <div>
                   <div className="flex justify-between mb-1">
                     <span className="text-sm">Delivery & Presence</span>
                     <span className={`text-sm font-medium ${getScoreColor(avgDeliveryScore)}`}>
                       {avgDeliveryScore}%
                     </span>
                   </div>
                   <Progress value={avgDeliveryScore} className="h-2" />
                 </div>
               </div>
             </div>
           </div>
         </Card>
 
         {/* STAR Analysis & Emotion Chart */}
         <div className="grid md:grid-cols-2 gap-6 mb-8">
           {/* STAR Radar Chart */}
           <Card className="p-6 bg-gradient-card border-border">
             <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
               <Target className="w-5 h-5 text-primary" />
               STAR Method Analysis
             </h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                 <RadarChart data={starRadarData}>
                   <PolarGrid stroke="hsl(var(--border))" />
                   <PolarAngleAxis 
                     dataKey="subject" 
                     tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                   />
                   <PolarRadiusAxis 
                     angle={30} 
                     domain={[0, 100]} 
                     tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                   />
                   <Radar
                     name="Score"
                     dataKey="score"
                     stroke="hsl(var(--primary))"
                     fill="hsl(var(--primary))"
                     fillOpacity={0.4}
                   />
                   <Tooltip 
                     contentStyle={{ 
                       backgroundColor: 'hsl(var(--card))', 
                       border: '1px solid hsl(var(--border))',
                       borderRadius: '8px'
                     }}
                   />
                 </RadarChart>
               </ResponsiveContainer>
             </div>
             <div className="grid grid-cols-2 gap-2 mt-4">
               {Object.entries(avgStar).map(([key, value]) => (
                 <div key={key} className="flex justify-between text-sm">
                   <span className="capitalize text-muted-foreground">{key}</span>
                   <span className={getScoreColor(value)}>{value}%</span>
                 </div>
               ))}
             </div>
           </Card>
 
           {/* Emotion Distribution */}
           <Card className="p-6 bg-gradient-card border-border">
             <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
               <Smile className="w-5 h-5 text-accent" />
               Emotion Distribution
             </h3>
             {emotionData.length > 0 ? (
               <div className="h-64">
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={emotionData}
                       cx="50%"
                       cy="50%"
                       innerRadius={50}
                       outerRadius={80}
                       paddingAngle={5}
                       dataKey="value"
                       label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                     >
                       {emotionData.map((entry, index) => (
                         <Cell 
                           key={`cell-${index}`} 
                           fill={EMOTION_COLORS[entry.name] || 'hsl(var(--muted-foreground))'} 
                         />
                       ))}
                     </Pie>
                     <Tooltip 
                       contentStyle={{ 
                         backgroundColor: 'hsl(var(--card))', 
                         border: '1px solid hsl(var(--border))',
                         borderRadius: '8px'
                       }}
                     />
                   </PieChart>
                 </ResponsiveContainer>
               </div>
             ) : (
               <div className="h-64 flex items-center justify-center text-muted-foreground">
                 No emotion data recorded
               </div>
             )}
           </Card>
         </div>
 
         {/* Strengths & Improvements */}
         <div className="grid md:grid-cols-2 gap-6 mb-8">
           <Card className="p-6 bg-gradient-card border-border">
             <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
               <Trophy className="w-5 h-5 text-yellow-400" />
               Top Strengths
             </h3>
             <ul className="space-y-3">
               {uniqueStrengths.map((strength, i) => (
                 <li key={i} className="flex items-start gap-3">
                   <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                   <span className="text-sm">{strength}</span>
                 </li>
               ))}
               {uniqueStrengths.length === 0 && (
                 <li className="text-muted-foreground text-sm">
                   Complete more questions to see strengths
                 </li>
               )}
             </ul>
           </Card>
 
           <Card className="p-6 bg-gradient-card border-border">
             <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
               <TrendingUp className="w-5 h-5 text-primary" />
               Areas to Improve
             </h3>
             <ul className="space-y-3">
               {uniqueImprovements.map((improvement, i) => (
                 <li key={i} className="flex items-start gap-3">
                   <AlertCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                   <span className="text-sm">{improvement}</span>
                 </li>
               ))}
               {uniqueImprovements.length === 0 && (
                 <li className="text-muted-foreground text-sm">
                   No improvements identified - great job!
                 </li>
               )}
             </ul>
           </Card>
         </div>
 
         {/* Question-by-Question Breakdown */}
         <Card className="p-6 bg-gradient-card border-border mb-8">
           <h3 className="text-lg font-semibold mb-4">Question Breakdown</h3>
           <div className="space-y-4">
             {results.map((result, index) => (
               <div 
                 key={index} 
                 className="p-4 rounded-lg bg-secondary/30 border border-border"
               >
                 <div className="flex items-start justify-between gap-4">
                   <div className="flex-1">
                     <div className="flex items-center gap-2 mb-2">
                       <Badge variant="outline" className="text-xs">
                         {result.category}
                       </Badge>
                       <span className="text-xs text-muted-foreground">
                         Q{index + 1}
                       </span>
                     </div>
                     <p className="text-sm font-medium mb-2">{result.question}</p>
                     {result.evaluation?.feedback && (
                       <p className="text-xs text-muted-foreground">
                         {result.evaluation.feedback}
                       </p>
                     )}
                   </div>
                   <div className="text-right">
                     <div className={`text-2xl font-bold ${getScoreColor(result.evaluation?.overallScore || 0)}`}>
                       {result.evaluation?.overallScore || 0}%
                     </div>
                     {result.evaluation?.quickTip && (
                       <p className="text-xs text-accent mt-1 max-w-[150px]">
                         💡 {result.evaluation.quickTip}
                       </p>
                     )}
                   </div>
                 </div>
               </div>
             ))}
           </div>
         </Card>
 
         {/* Categories Covered */}
         <Card className="p-6 bg-gradient-card border-border mb-8">
           <h3 className="text-lg font-semibold mb-4">Categories Covered</h3>
           <div className="flex flex-wrap gap-2">
             {categories.map((cat, i) => (
                 <Badge key={i} variant="secondary" className="text-primary">
                 {cat}
               </Badge>
             ))}
           </div>
         </Card>
 
         {/* Action Buttons */}
         <div className="flex flex-col sm:flex-row gap-4 justify-center">
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