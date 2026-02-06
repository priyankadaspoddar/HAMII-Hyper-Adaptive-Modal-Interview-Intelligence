import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, ArrowRight, Brain, Target, MessageSquare, Sparkles } from "lucide-react";

const InterviewModes = () => {
  return (
    <section className="py-20 bg-background" id="interview-modes">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-primary/10 border border-primary/20">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Choose Your Practice Mode</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Interview Practice Modes
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Two powerful ways to practice and master your interview skills with AI-powered feedback
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Resume-Based Interview */}
          <Card className="group relative overflow-hidden border-border bg-gradient-card hover:border-primary/50 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="relative">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <CardTitle className="text-2xl text-foreground">Resume-Based Interview</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Upload your resume and get personalized technical questions tailored to your experience
              </CardDescription>
            </CardHeader>
            <CardContent className="relative space-y-4">
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Brain className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">AI analyzes your resume to generate relevant questions</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">Real-time vision analysis with Gemini 2.5 Pro</span>
                </li>
                <li className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">Technical depth evaluation and feedback</span>
                </li>
              </ul>
              <Button 
                className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => window.location.href = '/interview'}
              >
                Start Resume Interview
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* HR/Behavioral Interview */}
          <Card className="group relative overflow-hidden border-border bg-gradient-card hover:border-accent/50 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="relative">
              <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                <Users className="w-7 h-7 text-accent" />
              </div>
              <CardTitle className="text-2xl text-foreground">HR/Behavioral Interview</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Practice common behavioral questions with STAR method evaluation
              </CardDescription>
            </CardHeader>
            <CardContent className="relative space-y-4">
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">5 randomized questions from diverse categories</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">STAR structure analysis (Situation, Task, Action, Result)</span>
                </li>
                <li className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">Emotion tracking and delivery feedback</span>
                </li>
              </ul>
              <Button 
                className="w-full mt-4 bg-accent hover:bg-accent/90 text-accent-foreground"
                onClick={() => window.location.href = '/hr-interview'}
              >
                Start HR Interview
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default InterviewModes;
