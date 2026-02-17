import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Mic, MicOff, Video, VideoOff, Square, ArrowLeft,
  Loader2, Play, SkipForward, CheckCircle, ChevronRight, AlertCircle
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VisionAnalyzer } from "@/lib/visionAnalysis";
import { AudioAnalyzer } from "@/lib/audioAnalysis";
import { SpeechRecognitionService, SpeechAnalyzer } from "@/lib/speechRecognition";
import { FusionAlgorithm } from "@/lib/fusionAlgorithm";
import type { RawMetrics, FusedMetrics } from "@/lib/fusionAlgorithm";
import HRInterviewSummary from "./HRInterviewSummary";

interface HRQuestion {
  question: string;
  category: string;
  role: string;
  experience: string;
  difficulty: string;
  source_type: string;
  ideal_answer: string;
  keywords: string[];
  improved_question: string;
}

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

const HRInterview = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<HRQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [results, setResults] = useState<HRQuestionResult[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  const [currentMetrics, setCurrentMetrics] = useState<FusedMetrics | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<string | null>(null);
  const [aiVisionMetrics, setAiVisionMetrics] = useState<{
    detectedEmotion?: string;
    gestureType?: string;
    postureType?: string;
  } | null>(null);

  const visionAnalyzerRef = useRef<VisionAnalyzer | null>(null);
  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionService | null>(null);
  const speechAnalyzerRef = useRef<SpeechAnalyzer>(new SpeechAnalyzer());
  const fusionAlgorithmRef = useRef<FusionAlgorithm>(new FusionAlgorithm());
  const animationFrameRef = useRef<number | null>(null);
  const metricsHistoryRef = useRef<FusedMetrics[]>([]);
  const emotionHistoryRef = useRef<string[]>([]);
  const aiAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const totalTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const response = await fetch('/data/hr_interview_questions.json');
        const allQuestions: HRQuestion[] = await response.json();
        const selectedQuestions = selectDiverseQuestions(allQuestions, 5);
        setQuestions(selectedQuestions);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load questions:', error);
        toast({
          title: "Error Loading Questions",
          description: "Could not load HR interview questions",
          variant: "destructive"
        });
      }
    };
    loadQuestions();
  }, [toast]);

  const selectDiverseQuestions = (allQuestions: HRQuestion[], count: number): HRQuestion[] => {
    const categories = [...new Set(allQuestions.map(q => q.category))];
    const selected: HRQuestion[] = [];
    const usedCategories = new Set<string>();

    for (const cat of categories) {
      if (selected.length >= count) break;
      const catQuestions = allQuestions.filter(q => q.category === cat);
      if (catQuestions.length === 0) continue;
      const randomQ = catQuestions[Math.floor(Math.random() * catQuestions.length)];
      if (randomQ && !usedCategories.has(cat)) {
        selected.push(randomQ);
        usedCategories.add(cat);
      }
    }

    while (selected.length < count) {
      const remaining = allQuestions.filter(q => !selected.includes(q));
      if (remaining.length === 0) break;
      const randomQ = remaining[Math.floor(Math.random() * remaining.length)];
      selected.push(randomQ);
    }

    return selected;
  };

  useEffect(() => {
    const init = async () => {
      try {
        console.log("Initializing AI models...");
        visionAnalyzerRef.current = new VisionAnalyzer();
        await visionAnalyzerRef.current.initialize();
        setModelsLoaded(true);

        const speechService = new SpeechRecognitionService();
        if (speechService.isSupported()) {
          speechRecognitionRef.current = speechService;
          speechService.onTranscript((text, isFinal) => {
            if (isFinal) {
              setTranscript(prev => prev + ' ' + text);
              setInterimTranscript('');
            } else {
              setInterimTranscript(text);
            }
          });
        }
      } catch (error) {
        console.error("Model init error:", error);
        setModelsLoaded(true);
      }
    };

    init();

    fusionAlgorithmRef.current.setContext('job-seekers');

    return () => {
      if (visionAnalyzerRef.current) visionAnalyzerRef.current.cleanup();
      if (audioAnalyzerRef.current) audioAnalyzerRef.current.cleanup();
      if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (totalTimerRef.current) clearInterval(totalTimerRef.current);
      if (aiAnalysisIntervalRef.current) clearInterval(aiAnalysisIntervalRef.current);
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(err => console.log("Autoplay handled:", err));
      }

      setStream(mediaStream);
      setIsCameraOn(true);
      setIsMicOn(true);
      toast({ title: "Camera Ready", description: "Ready to start interview" });
    } catch (error: any) {
      console.error("Camera error:", error);
      toast({
        title: error.name === "NotAllowedError" ? "Access Denied" : "Camera Error",
        description: "Please allow camera & microphone access",
        variant: "destructive"
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraOn(false);
      setIsMicOn(false);
    }
  };

  const toggleMicrophone = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => { track.enabled = !track.enabled; });
      setIsMicOn(!isMicOn);
    }
  };

  const startInterview = () => {
    if (!isCameraOn || !stream) {
      toast({ title: "Camera Required", description: "Enable camera first", variant: "destructive" });
      return;
    }
    setInterviewStarted(true);
    setResults([]);
    setCurrentQuestionIndex(0);
    setTotalDuration(0);
    totalTimerRef.current = setInterval(() => setTotalDuration(p => p + 1), 1000);
  };

  useEffect(() => {
    if (stream && videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => console.log("Play handled:", err));
    }
  }, [stream, interviewStarted]);

  const isRecordingRef = useRef(false);

  const startRecording = useCallback(() => {
    if (!isCameraOn || !stream) return;

    isRecordingRef.current = true;
    setIsRecording(true);
    setRecordingTime(0);
    setTranscript("");
    setInterimTranscript("");
    setCurrentFeedback(null);
    metricsHistoryRef.current = [];
    emotionHistoryRef.current = [];
    speechAnalyzerRef.current.reset();
    fusionAlgorithmRef.current.reset();
    setAiVisionMetrics(null);

    audioAnalyzerRef.current = new AudioAnalyzer();
    audioAnalyzerRef.current.initialize(stream);

    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.start();
    }

    timerIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);

    const runAnalysis = async () => {
      if (!videoRef.current || !isRecordingRef.current) return;
      const video = videoRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.7);

        const { data, error } = await supabase.functions.invoke('analyze-presentation', {
          body: {
            imageData,
            transcript: transcript + ' ' + interimTranscript,
            model: "gemini-2.5-pro"
          }
        });

        if (error) throw error;
        if (!data?.vision) return;

        const detectedEmotion = data.vision.detectedEmotion;
        setAiVisionMetrics({
          detectedEmotion,
          gestureType: data.vision.gestureType,
          postureType: data.vision.postureType,
        });

        if (detectedEmotion) emotionHistoryRef.current.push(detectedEmotion);

        const aiMetrics: FusedMetrics = {
          eyeContact: data.vision.eyeContact ?? 50,
          posture: data.vision.posture ?? 50,
          bodyLanguage: data.vision.bodyLanguage ?? 50,
          facialExpression: data.vision.expression ?? 50,
          voiceQuality: data.voice?.tone ?? 50,
          speechClarity: data.voice?.clarity ?? 50,
          contentEngagement: data.voice?.engagement ?? 50,
          overallScore: data.overall ?? 50,
          confidence: 0.8,
        };

        setCurrentMetrics(aiMetrics);
        metricsHistoryRef.current.push(aiMetrics);
      } catch (err) {
        console.warn("Vision analysis failed:", err);
      }
    };

    aiAnalysisIntervalRef.current = setInterval(runAnalysis, 3000);
    setTimeout(runAnalysis, 500);

    const analyzeFrame = async () => {
      if (!videoRef.current || !isRecordingRef.current) return;
      const video = videoRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(analyzeFrame);
        return;
      }

      try {
        const timestamp = performance.now();
        const visionMetrics = visionAnalyzerRef.current
          ? await visionAnalyzerRef.current.analyzeFrame(video, timestamp)
          : null;

        const audioFeatures = audioAnalyzerRef.current?.getAudioFeatures() ?? null;
        const speechMetrics = speechAnalyzerRef.current.getMetrics();

        if (visionMetrics) {
          const rawMetrics: RawMetrics = {
            eyeContact: visionMetrics.face.eyeContact,
            emotion: visionMetrics.face.emotion,
            emotionConfidence: visionMetrics.face.emotionConfidence,
            postureScore: visionMetrics.posture.postureScore,
            shoulderAlignment: visionMetrics.posture.shoulderAlignment,
            headPosition: visionMetrics.posture.headPosition,
            gestureVariety: visionMetrics.gestures.gestureVariety,
            handVisibility: visionMetrics.gestures.handVisibility,
            pitch: audioFeatures?.pitch ?? 0,
            pitchVariation: audioFeatures?.pitchVariation ?? 0,
            volume: audioFeatures?.volume ?? 0,
            volumeVariation: audioFeatures?.volumeVariation ?? 0,
            clarity: audioFeatures?.clarity ?? 0,
            energy: audioFeatures?.energy ?? 0,
            wordsPerMinute: speechMetrics.wordsPerMinute,
            fillerCount: speechMetrics.fillerCount,
            fillerPercentage: speechMetrics.fillerPercentage,
            clarityScore: speechMetrics.clarityScore,
            fluencyScore: speechMetrics.fluencyScore,
            articulationScore: speechMetrics.articulationScore,
          };

          let fused = fusionAlgorithmRef.current.fuse(rawMetrics);

          if (metricsHistoryRef.current.length > 0) {
            const lastAi = metricsHistoryRef.current[metricsHistoryRef.current.length - 1];
            fused.eyeContact     = Math.round(fused.eyeContact     * 0.3 + lastAi.eyeContact     * 0.7);
            fused.posture        = Math.round(fused.posture        * 0.3 + lastAi.posture        * 0.7);
            fused.bodyLanguage   = Math.round(fused.bodyLanguage   * 0.3 + lastAi.bodyLanguage   * 0.7);
            fused.facialExpression = Math.round(fused.facialExpression * 0.3 + lastAi.facialExpression * 0.7);
          }

          setCurrentMetrics(fused);
        }
      } catch (err) {
        console.error("Frame analysis error:", err);
      }

      if (isRecordingRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyzeFrame);
      }
    };

    analyzeFrame();
  }, [isCameraOn, stream, transcript, interimTranscript]);

  const stopRecording = useCallback(async () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
    if (audioAnalyzerRef.current) audioAnalyzerRef.current.cleanup();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (aiAnalysisIntervalRef.current) clearInterval(aiAnalysisIntervalRef.current);

    const avgMetrics = calculateAverageMetrics();
    await evaluateAnswer(avgMetrics);
  }, []);

  const calculateAverageMetrics = () => {
    const history = metricsHistoryRef.current;
    if (history.length === 0) {
      return { eyeContact: 0, posture: 0, bodyLanguage: 0, facialExpression: 0 };
    }
    return {
      eyeContact: Math.round(history.reduce((sum, m) => sum + m.eyeContact, 0) / history.length),
      posture: Math.round(history.reduce((sum, m) => sum + m.posture, 0) / history.length),
      bodyLanguage: Math.round(history.reduce((sum, m) => sum + m.bodyLanguage, 0) / history.length),
      facialExpression: Math.round(history.reduce((sum, m) => sum + m.facialExpression, 0) / history.length),
    };
  };

  const evaluateAnswer = async (avgMetrics: ReturnType<typeof calculateAverageMetrics>) => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setIsEvaluating(true);
    setCurrentFeedback(null);

    const cleanAnswer = transcript.trim() || "(No speech detected)";

    try {
      console.log("Evaluating answer:", {
        question: currentQuestion.improved_question.substring(0, 60) + "...",
        answerLength: cleanAnswer.length,
        hasSpeech: cleanAnswer.length > 10
      });

      const { data, error } = await supabase.functions.invoke('evaluate-hr-answer', {
        body: {
          question: currentQuestion.improved_question,
          category: currentQuestion.category,
          answer: cleanAnswer,
          idealAnswer: currentQuestion.ideal_answer,
          keywords: currentQuestion.keywords,
          visionMetrics: {
            ...avgMetrics,
            detectedEmotion: aiVisionMetrics?.detectedEmotion,
            gestureType: aiVisionMetrics?.gestureType,
            postureType: aiVisionMetrics?.postureType,
          },
          emotionHistory: emotionHistoryRef.current,
          model: "gemini-2.5-pro"
        }
      });

      if (error) {
        console.error("Edge function returned error:", error);
        throw new Error(error.message || "Backend evaluation failed");
      }

      console.log("Evaluation successful:", data);

      const result: HRQuestionResult = {
        question: currentQuestion.improved_question,
        category: currentQuestion.category,
        answer: cleanAnswer,
        evaluation: data,
        emotionHistory: [...emotionHistoryRef.current],
        avgMetrics,
      };

      setResults(prev => [...prev, result]);
      setCurrentFeedback(data.feedback || "Evaluation completed");

      toast({
        title: `Score: ${data.overallScore ?? "?"}%`,
        description: data.quickTip || "Answer recorded",
      });

    } catch (err: any) {
      console.error("Evaluation failed:", err);

      toast({
        title: "Evaluation failed",
        description: err.message?.includes("non-2xx") 
          ? "Backend issue – check Supabase logs" 
          : (err.message || "Could not get AI feedback"),
        variant: "destructive"
      });

      // IMPORTANT: Save the answer anyway
      const result: HRQuestionResult = {
        question: currentQuestion.improved_question,
        category: currentQuestion.category,
        answer: cleanAnswer,
        evaluation: null,
        emotionHistory: [...emotionHistoryRef.current],
        avgMetrics,
      };

      setResults(prev => [...prev, result]);
      setCurrentFeedback("Answer saved, but AI evaluation failed. Check console & Supabase.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTranscript("");
      setInterimTranscript("");
      setCurrentFeedback(null);
      setCurrentMetrics(null);
      setAiVisionMetrics(null);
    } else {
      if (totalTimerRef.current) clearInterval(totalTimerRef.current);
      stopCamera();
      setShowSummary(true);
    }
  };

  const skipQuestion = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion) {
      const result: HRQuestionResult = {
        question: currentQuestion.improved_question,
        category: currentQuestion.category,
        answer: "(Skipped)",
        evaluation: null,
        emotionHistory: [],
        avgMetrics: { eyeContact: 0, posture: 0, bodyLanguage: 0, facialExpression: 0 },
      };
      setResults(prev => [...prev, result]);
    }
    nextQuestion();
  };

  const restartInterview = () => {
    setShowSummary(false);
    setResults([]);
    setCurrentQuestionIndex(0);
    setInterviewStarted(false);
    setTotalDuration(0);
    window.location.reload();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const getEmotionBadgeColor = (emotion?: string) => {
    switch (emotion?.toLowerCase()) {
      case 'happy': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'confident': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'nervous': case 'anxious': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'stressed': case 'angry': case 'frustrated': return 'bg-destructive/20 text-destructive border-destructive/50';
      case 'focused': case 'attentive': return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
      default: return 'bg-muted/80 text-muted-foreground border-muted-foreground/50';
    }
  };

  const getEmotionEmoji = (emotion?: string) => {
    switch (emotion?.toLowerCase()) {
      case 'happy': return '😊';
      case 'confident': return '💪';
      case 'nervous': return '😰';
      case 'anxious': return '😟';
      case 'stressed': return '😓';
      case 'angry': return '😠';
      case 'frustrated': return '😤';
      case 'focused': return '🎯';
      case 'attentive': return '👀';
      case 'calm': return '😌';
      case 'neutral': return '😐';
      default: return '🤔';
    }
  };

  const getPostureEmoji = (posture?: string) => {
    switch (posture?.toLowerCase()) {
      case 'upright': return '🧍';
      case 'confident': return '💪';
      case 'relaxed': return '😊';
      case 'slouched': return '😔';
      case 'leaning': return '↗️';
      case 'tense': return '😬';
      default: return '🧍';
    }
  };

  const getGestureEmoji = (gesture?: string) => {
    switch (gesture?.toLowerCase()) {
      case 'open': return '🤲';
      case 'expressive': return '🙌';
      case 'minimal': return '✋';
      case 'fidgeting': return '🤏';
      case 'closed': return '🤐';
      default: return '👋';
    }
  };

  if (showSummary) {
    return (
      <HRInterviewSummary
        results={results}
        totalDuration={totalDuration}
        onRestart={restartInterview}
        onGoHome={() => navigate('/')}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading questions...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progressPercent = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          {interviewStarted && (
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-sm">
                Total: {formatTime(totalDuration)}
              </Badge>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Question {currentQuestionIndex + 1}/{questions.length}
                </span>
                <Progress value={progressPercent} className="w-24 h-2" />
              </div>
            </div>
          )}
        </div>

        {!interviewStarted ? (
          <div className="max-w-3xl mx-auto">
            <Card className="p-8 bg-gradient-card border-border text-center">
              <h1 className="text-3xl font-bold mb-4">HR/Behavioral Interview Practice</h1>
              <p className="text-muted-foreground mb-6">
                Answer using STAR method. AI (Gemini 2.5 Pro) will analyze content & delivery.
              </p>

              <div className="mb-8">
                <div className="relative aspect-video bg-background rounded-lg overflow-hidden max-w-xl mx-auto">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {!isCameraOn && (
                    <div className="absolute inset-0 flex items-center justify-center bg-secondary/90">
                      <div className="text-center">
                        <Camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">Camera preview here</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-center gap-4 mb-6">
                <Button
                  onClick={isCameraOn ? stopCamera : startCamera}
                  variant={isCameraOn ? "destructive" : "default"}
                  className="gap-2"
                >
                  {isCameraOn ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                  {isCameraOn ? "Stop Camera" : "Enable Camera"}
                </Button>
              </div>

              <Button
                onClick={startInterview}
                size="lg"
                disabled={!isCameraOn || !modelsLoaded}
                className="gap-2"
              >
                {!modelsLoaded ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading models...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start Interview
                  </>
                )}
              </Button>
            </Card>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-6 bg-gradient-card border-border">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Badge className="mb-2 bg-primary/20 text-primary">{currentQuestion?.category}</Badge>
                    <h2 className="text-xl font-semibold">{currentQuestion?.improved_question}</h2>
                  </div>
                  <Badge variant="outline">{currentQuestion?.difficulty}</Badge>
                </div>
              </Card>

              <Card className="p-4 bg-gradient-card border-border">
                <div className="relative aspect-video bg-background rounded-lg overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

                  {isRecording && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive/90 px-3 py-1 rounded-full">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-sm text-white font-medium">{formatTime(recordingTime)}</span>
                    </div>
                  )}

                  {isRecording && (
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                      {aiVisionMetrics?.detectedEmotion && (
                        <Badge className={`${getEmotionBadgeColor(aiVisionMetrics.detectedEmotion)} border backdrop-blur-sm px-3 py-1.5 text-sm`}>
                          <span className="mr-1.5 text-base animate-bounce">{getEmotionEmoji(aiVisionMetrics.detectedEmotion)}</span>
                          {aiVisionMetrics.detectedEmotion}
                        </Badge>
                      )}
                      {/* ... other badges ... */}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center gap-4 mt-4">
                  <Button onClick={toggleMicrophone} variant="outline" size="icon" className="rounded-full">
                    {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </Button>

                  {!isRecording ? (
                    <Button onClick={startRecording} size="lg" className="gap-2 px-8" disabled={isEvaluating}>
                      <Play className="w-4 h-4" />
                      Start Answering
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} variant="destructive" size="lg" className="gap-2 px-8">
                      <Square className="w-4 h-4" />
                      Stop & Submit
                    </Button>
                  )}

                  <Button onClick={skipQuestion} variant="ghost" size="icon" className="rounded-full" disabled={isRecording || isEvaluating}>
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>
              </Card>

              <Card className="p-4 bg-gradient-card border-border">
                <h3 className="text-sm font-medium mb-2 text-muted-foreground">Your Answer</h3>
                <div className="min-h-[100px] p-3 bg-secondary/30 rounded-lg text-sm whitespace-pre-wrap">
                  {transcript || interimTranscript ? (
                    <>
                      <span>{transcript}</span>
                      <span className="text-muted-foreground italic"> {interimTranscript}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {isRecording ? "Speak now..." : "Click 'Start Answering' to begin"}
                    </span>
                  )}
                </div>
              </Card>

              {(currentFeedback || isEvaluating) && (
                <Card className="p-4 bg-gradient-card border-border">
                  {isEvaluating ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="text-muted-foreground">Evaluating answer...</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <h3 className="font-medium">Feedback</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">{currentFeedback}</p>
                      <Button onClick={nextQuestion} className="gap-2">
                        {currentQuestionIndex < questions.length - 1 ? (
                          <>Next Question <ChevronRight className="w-4 h-4" /></>
                        ) : (
                          <>View Summary <ChevronRight className="w-4 h-4" /></>
                        )}
                      </Button>
                    </div>
                  )}
                </Card>
              )}
            </div>

            {/* Sidebar metrics - keep as is or simplify if needed */}
            <div className="space-y-4">
              {/* ... your existing metrics sidebar ... */}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRInterview;
