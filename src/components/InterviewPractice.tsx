import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Upload, FileText, Loader2, ArrowLeft, ArrowRight, 
  Camera, Mic, MicOff, Video, VideoOff, Square, 
  CheckCircle, XCircle, ChevronRight, AlertCircle, SkipForward
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VisionAnalyzer } from "@/lib/visionAnalysis";
import { AudioAnalyzer } from "@/lib/audioAnalysis";
import { SpeechRecognitionService, SpeechAnalyzer } from "@/lib/speechRecognition";
import { ContentAnalyzer } from "@/lib/contentAnalysis";
import { FusionAlgorithm } from "@/lib/fusionAlgorithm";
import type { RawMetrics, FusedMetrics } from "@/lib/fusionAlgorithm";
import { parseResume, validateResumeContent, type ParsedResume } from "@/lib/resumeParser";
import { SessionSummary } from "@/components/SessionSummary";

interface InterviewQuestion {
  question: string;
  category: string;
  skillAssessed: string;
  resumeReference?: string;
  answerTip: string;
}

interface ExtractedProject {
  name: string;
  technologies?: string[];
  description?: string;
  metrics?: string;
}

interface ExtractedExperience {
  company: string;
  role: string;
  duration?: string;
  responsibilities?: string[];
}

interface ExtractedEducation {
  degree: string;
  institution: string;
  year?: string;
  gpa?: string;
}

interface ExtractedEntities {
  name: string;
  email?: string;
  skills: string[];
  projects?: ExtractedProject[];
  experience?: ExtractedExperience[];
  education?: ExtractedEducation[];
  achievements?: string[];
}

interface ExtractionConfidence {
  skillsFound: number;
  projectsFound?: number;
  experienceFound?: number;
  educationFound?: number;
  overallQuality: 'high' | 'medium' | 'low';
}

interface AnswerEvaluation {
  contentScore: number;
  deliveryScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  sampleAnswer?: string;
  overallFeedback: string;
  deliveryFeedback?: string;
}

interface QuestionResult {
  question: InterviewQuestion;
  answer: string;
  evaluation: AnswerEvaluation | null;
  metrics: FusedMetrics | null;
  emotionHistory: string[];
}

const extractFunctionErrorMessage = async (error: unknown): Promise<string> => {
  const fallbackMessage = "Could not generate questions";

  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const errorWithContext = error as Error & { context?: Response };
  if (errorWithContext.context instanceof Response) {
    try {
      const payload = await errorWithContext.context.clone().json();
      if (typeof payload?.error === "string" && payload.error.length > 0) {
        return payload.error;
      }
    } catch {
      // If the function response is not JSON, fall back to known error checks.
    }

    if (errorWithContext.context.status === 402) {
      return "AI credits exhausted. Please add more credits in Lovable, then retry.";
    }
  }

  return error.message || fallbackMessage;
};

const InterviewPractice = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Resume upload state
  const [resumeText, setResumeText] = useState("");
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [candidateSummary, setCandidateSummary] = useState("");
  const [extractedEntities, setExtractedEntities] = useState<ExtractedEntities | null>(null);
  const [extractionConfidence, setExtractionConfidence] = useState<ExtractionConfidence | null>(null);
  
  // Interview state
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  
  // Recording state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  
  // Metrics state
  const [currentMetrics, setCurrentMetrics] = useState<FusedMetrics | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [aiVisionMetrics, setAiVisionMetrics] = useState<{
    detectedEmotion?: string;
    gestureType?: string;
    postureType?: string;
  } | null>(null);
  
  // Refs
  const visionAnalyzerRef = useRef<VisionAnalyzer | null>(null);
  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionService | null>(null);
  const speechAnalyzerRef = useRef<SpeechAnalyzer>(new SpeechAnalyzer());
  const contentAnalyzerRef = useRef<ContentAnalyzer>(new ContentAnalyzer());
  const fusionAlgorithmRef = useRef<FusionAlgorithm>(new FusionAlgorithm());
  const animationFrameRef = useRef<number | null>(null);
  const metricsHistoryRef = useRef<FusedMetrics[]>([]);
  const emotionHistoryRef = useRef<string[]>([]);
  const aiAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastAiAnalysisRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize models
  useEffect(() => {
    const init = async () => {
      try {
        console.log("Initializing AI models for interview...");
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

    return () => {
      if (visionAnalyzerRef.current) visionAnalyzerRef.current.cleanup();
      if (audioAnalyzerRef.current) audioAnalyzerRef.current.cleanup();
      if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (aiAnalysisIntervalRef.current) clearInterval(aiAnalysisIntervalRef.current);
    };
  }, []);

  // Set fusion context to job-seekers
  useEffect(() => {
    fusionAlgorithmRef.current.setContext('job-seekers');
  }, []);

  // Re-attach stream to video element when it changes
  useEffect(() => {
    if (stream && videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.log("Video play handled:", err);
      });
    }
  }, [stream, interviewStarted]);

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsingResume(true);
    
    try {
      // Use the efficient resume parser for all file types
      const result = await parseResume(file);
      
      // Validate the parsed content
      const validation = validateResumeContent(result);
      
      if (!result.success || !result.data) {
        toast({ 
          title: "Parse Error", 
          description: result.error || "Could not parse the file.", 
          variant: "destructive" 
        });
        return;
      }
      
      setResumeText(result.data.text);
      
      // Show appropriate toast based on file type and validation
      const fileType = file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 
                       file.name.toLowerCase().endsWith('.docx') ? 'DOCX' : 'Text';
      
      if (validation.isValid) {
        toast({ 
          title: `${fileType} Resume Parsed`, 
          description: `${result.data.pageCount} page(s) extracted. ${result.data.sections ? 'Sections detected.' : ''}` 
        });
      } else {
        toast({ 
          title: "Resume Parsed", 
          description: validation.message, 
          variant: "destructive" 
        });
      }
      
    } catch (error) {
      console.error("Error parsing resume:", error);
      toast({ 
        title: "Parse Error", 
        description: error instanceof Error ? error.message : "Could not parse the file.", 
        variant: "destructive" 
      });
    } finally {
      setIsParsingResume(false);
    }
  };

  const generateQuestions = async () => {
    if (!resumeText.trim()) {
      toast({ title: "No Resume", description: "Please upload your resume first", variant: "destructive" });
      return;
    }

    setIsGeneratingQuestions(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-interview-questions', {
        body: { resumeText, numberOfQuestions: 5 }
      });

      if (error) throw error;
      
      if (data.questions) {
        setQuestions(data.questions);
        setCandidateSummary(data.candidateSummary || "");
        setExtractedEntities(data.extractedEntities || null);
        setExtractionConfidence(data.extractionConfidence || null);
        
        const confidence = data.extractionConfidence;
        toast({ 
          title: "NER-KE Extraction Complete", 
          description: `Found ${confidence?.skillsFound || 0} skills, ${confidence?.projectsFound || 0} projects. Quality: ${confidence?.overallQuality || 'N/A'}` 
        });
      }
    } catch (error: unknown) {
      console.error("Error generating questions:", error);
      const errorMessage = await extractFunctionErrorMessage(error);
      toast({ 
        title: "Generation Failed", 
        description: errorMessage,
        variant: "destructive" 
      });
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.log("Autoplay handled by browser:", playError);
        }
      }
      setStream(mediaStream);
      setIsCameraOn(true);
      setIsMicOn(true);
      toast({ title: "Camera Ready", description: "Ready to start your interview" });
    } catch (error: any) {
      console.error("Camera error:", error);
      if (error.name === "NotAllowedError") {
        toast({ title: "Camera Access Denied", description: "Please allow camera and microphone access in your browser settings", variant: "destructive" });
      } else if (error.name === "NotFoundError") {
        toast({ title: "Camera Not Found", description: "No camera detected. Please connect a camera and try again.", variant: "destructive" });
      } else {
        toast({ title: "Camera Error", description: "Could not access camera. Please check permissions.", variant: "destructive" });
      }
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

  // AI-powered vision analysis using Gemini 2.5 Pro
  const runAiVisionAnalysis = async () => {
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
        body: { imageData, transcript: transcript + ' ' + interimTranscript }
      });
      
      if (error) {
        console.error('AI vision analysis error:', error);
        return;
      }
      
      if (data?.vision) {
        const detectedEmotion = data.vision.detectedEmotion;
        setAiVisionMetrics({
          detectedEmotion,
          gestureType: data.vision.gestureType,
          postureType: data.vision.postureType,
        });

        // Track emotion history
        if (detectedEmotion) {
          emotionHistoryRef.current.push(detectedEmotion);
        }
        
        // Blend AI scores with local metrics (70% AI / 30% local)
        const aiMetrics: FusedMetrics = {
          eyeContact: data.vision.eyeContact || 50,
          posture: data.vision.posture || 50,
          bodyLanguage: data.vision.bodyLanguage || 50,
          facialExpression: data.vision.expression || 50,
          voiceQuality: data.voice?.tone || 50,
          speechClarity: data.voice?.clarity || 50,
          contentEngagement: data.voice?.engagement || 50,
          overallScore: data.overall || 50,
          confidence: 0.8,
        };
        setCurrentMetrics(aiMetrics);
        metricsHistoryRef.current.push(aiMetrics);
        
        console.log('AI Vision Analysis:', detectedEmotion, data.vision.gestureType, data.vision.postureType);
      }
    } catch (error) {
      console.error('AI vision analysis failed:', error);
    }
  };

  const startRecording = useCallback(() => {
    if (!isCameraOn || !stream) return;

    isRecordingRef.current = true;
    setIsRecording(true);
    setRecordingTime(0);
    setTranscript("");
    setInterimTranscript("");
    metricsHistoryRef.current = [];
    emotionHistoryRef.current = [];
    speechAnalyzerRef.current.reset();
    fusionAlgorithmRef.current.reset();
    setAiVisionMetrics(null);
    lastAiAnalysisRef.current = 0;

    audioAnalyzerRef.current = new AudioAnalyzer();
    audioAnalyzerRef.current.initialize(stream);

    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.start();
    }
    
    // Recording timer
    timerIntervalRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
    
    // Start AI vision analysis (every 3 seconds)
    aiAnalysisIntervalRef.current = setInterval(runAiVisionAnalysis, 3000);
    setTimeout(runAiVisionAnalysis, 500);

    // Start local analysis loop
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
        
        const audioFeatures = audioAnalyzerRef.current?.getAudioFeatures() || null;
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
            pitch: audioFeatures?.pitch || 0,
            pitchVariation: audioFeatures?.pitchVariation || 0,
            volume: audioFeatures?.volume || 0,
            volumeVariation: audioFeatures?.volumeVariation || 0,
            clarity: audioFeatures?.clarity || 0,
            energy: audioFeatures?.energy || 0,
            wordsPerMinute: speechMetrics.wordsPerMinute,
            fillerCount: speechMetrics.fillerCount,
            fillerPercentage: speechMetrics.fillerPercentage,
            clarityScore: speechMetrics.clarityScore,
            fluencyScore: speechMetrics.fluencyScore,
            articulationScore: speechMetrics.articulationScore,
          };

          const fused = fusionAlgorithmRef.current.fuse(rawMetrics);
          
          // Blend with AI metrics if available (70% AI / 30% local)
          if (metricsHistoryRef.current.length > 0) {
            const lastAiMetrics = metricsHistoryRef.current[metricsHistoryRef.current.length - 1];
            fused.eyeContact = Math.round((fused.eyeContact * 0.3) + (lastAiMetrics.eyeContact * 0.7));
            fused.posture = Math.round((fused.posture * 0.3) + (lastAiMetrics.posture * 0.7));
            fused.bodyLanguage = Math.round((fused.bodyLanguage * 0.3) + (lastAiMetrics.bodyLanguage * 0.7));
            fused.facialExpression = Math.round((fused.facialExpression * 0.3) + (lastAiMetrics.facialExpression * 0.7));
          }
          
          setCurrentMetrics(fused);
        }
      } catch (error) {
        console.error("Analysis error:", error);
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
    if (aiAnalysisIntervalRef.current) clearInterval(aiAnalysisIntervalRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // Calculate average metrics
    const avgMetrics = calculateAverageMetrics();
    
    // Evaluate answer
    await evaluateAnswer(avgMetrics);
  }, []);

  const calculateAverageMetrics = (): FusedMetrics => {
    const history = metricsHistoryRef.current;
    if (history.length === 0) {
      return {
        eyeContact: 0, posture: 0, bodyLanguage: 0, facialExpression: 0,
        voiceQuality: 0, speechClarity: 0, contentEngagement: 0,
        overallScore: 0, confidence: 0
      };
    }

    const avg = (key: keyof FusedMetrics) => 
      Math.round(history.reduce((sum, m) => sum + (m[key] as number), 0) / history.length);

    return {
      eyeContact: avg('eyeContact'),
      posture: avg('posture'),
      bodyLanguage: avg('bodyLanguage'),
      facialExpression: avg('facialExpression'),
      voiceQuality: avg('voiceQuality'),
      speechClarity: avg('speechClarity'),
      contentEngagement: avg('contentEngagement'),
      overallScore: avg('overallScore'),
      confidence: avg('confidence')
    };
  };

  const evaluateAnswer = async (fusionMetrics: FusedMetrics) => {
    const currentQuestion = questions[currentQuestionIndex];
    const answer = transcript.trim();
    
    if (!answer) {
      toast({ title: "No Answer", description: "No speech was detected", variant: "destructive" });
      return;
    }

    setIsEvaluating(true);

    try {
      const { data, error } = await supabase.functions.invoke('evaluate-interview-answer', {
        body: {
          question: currentQuestion.question,
          answer,
          category: currentQuestion.category,
          skillAssessed: currentQuestion.skillAssessed,
          fusionMetrics
        }
      });

      if (error) throw error;

      const result: QuestionResult = {
        question: currentQuestion,
        answer,
        evaluation: data,
        metrics: fusionMetrics,
        emotionHistory: [...emotionHistoryRef.current]
      };

      setResults(prev => [...prev, result]);
      
      toast({ 
        title: "Answer Evaluated", 
        description: `Score: ${data.overallScore}/100` 
      });

    } catch (error: any) {
      console.error("Evaluation error:", error);
      
      // Save result without AI evaluation
      setResults(prev => [...prev, {
        question: currentQuestion,
        answer,
        evaluation: null,
        metrics: fusionMetrics,
        emotionHistory: [...emotionHistoryRef.current]
      }]);
      
      toast({ 
        title: "Evaluation Error", 
        description: error.message || "Could not evaluate answer", 
        variant: "destructive" 
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTranscript("");
      setInterimTranscript("");
      metricsHistoryRef.current = [];
    } else {
      setShowResults(true);
      stopCamera();
    }
  };

  const skipQuestion = () => {
    // Save result with no answer
    const currentQuestion = questions[currentQuestionIndex];
    setResults(prev => [...prev, {
      question: currentQuestion,
      answer: "(Skipped - No speech detected)",
      evaluation: null,
      metrics: null,
      emotionHistory: []
    }]);
    
    toast({ 
      title: "Question Skipped", 
      description: "Moving to next question" 
    });
    
    nextQuestion();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Timer is now handled by timerIntervalRef in startRecording

  // Results View
  if (showResults) {
    const avgScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.evaluation?.overallScore || 0), 0) / results.length)
      : 0;

    return (
      <div className="min-h-screen bg-gradient-hero p-4">
        <div className="container mx-auto max-w-4xl">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
          </Button>

          <Card className="p-8 bg-gradient-card border-border mb-6">
            <h2 className="text-3xl font-bold text-center mb-2">Interview Complete!</h2>
            <p className="text-center text-muted-foreground mb-6">Here's your performance summary</p>
            
            <div className="text-center mb-8">
              <div className="text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
                {avgScore}%
              </div>
              <p className="text-muted-foreground">Average Score</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {results.length > 0 && results[0].metrics && (
                <>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <p className="text-2xl font-bold text-primary">
                      {Math.round(results.reduce((s, r) => s + (r.metrics?.eyeContact || 0), 0) / results.length)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Eye Contact</p>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <p className="text-2xl font-bold text-primary">
                      {Math.round(results.reduce((s, r) => s + (r.metrics?.posture || 0), 0) / results.length)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Posture</p>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <p className="text-2xl font-bold text-primary">
                      {Math.round(results.reduce((s, r) => s + (r.metrics?.speechClarity || 0), 0) / results.length)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Clarity</p>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <p className="text-2xl font-bold text-primary">
                      {Math.round(results.reduce((s, r) => s + (r.metrics?.bodyLanguage || 0), 0) / results.length)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Body Language</p>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* AI Session Summary */}
          <SessionSummary 
            results={results} 
            candidateName={extractedEntities?.name}
          />

          {results.map((result, idx) => (
            <Card key={idx} className="p-6 bg-gradient-card border-border mb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-xs px-2 py-1 rounded bg-primary/20 text-primary">
                    {result.question.category}
                  </span>
                  <h3 className="text-lg font-semibold mt-2">Q{idx + 1}: {result.question.question}</h3>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">
                    {result.evaluation?.overallScore || 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
              </div>

              <div className="bg-background/50 p-4 rounded-lg mb-4">
                <p className="text-sm text-muted-foreground mb-1">Your Answer:</p>
                <p className="text-sm">{result.answer || "No answer recorded"}</p>
              </div>

              {result.evaluation && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-500">{result.evaluation.contentScore}%</p>
                      <p className="text-xs text-muted-foreground">Content</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-500">{result.evaluation.deliveryScore}%</p>
                      <p className="text-xs text-muted-foreground">Delivery</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-primary">{result.evaluation.overallScore}%</p>
                      <p className="text-xs text-muted-foreground">Overall</p>
                    </div>
                  </div>

                  {result.evaluation.strengths.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-green-500 mb-2 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-1" /> Strengths
                      </p>
                      <ul className="text-sm text-muted-foreground list-disc list-inside">
                        {result.evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}

                  {result.evaluation.improvements.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-orange-500 mb-2 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" /> Areas to Improve
                      </p>
                      <ul className="text-sm text-muted-foreground list-disc list-inside">
                        {result.evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="bg-primary/10 p-4 rounded-lg">
                    <p className="text-sm">{result.evaluation.overallFeedback}</p>
                  </div>
                </div>
              )}
            </Card>
          ))}

          <div className="flex justify-center gap-4 mt-8">
            <Button onClick={() => navigate("/")}>
              Back to Home
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Practice Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Resume Upload View
  if (!questions.length) {
    return (
      <div className="min-h-screen bg-gradient-hero p-4 flex items-center justify-center">
        <div className="container mx-auto max-w-2xl">
          <Button variant="ghost" onClick={() => navigate("/practice")} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Practice
          </Button>

          <Card className="p-8 bg-gradient-card border-border">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
                Interview Practice
              </h1>
              <p className="text-muted-foreground">
                Upload your resume to get personalized interview questions
              </p>
            </div>

            <div className="space-y-6">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".txt,.pdf,.doc,.docx"
                  onChange={handleResumeUpload}
                  className="hidden"
                  id="resume-upload"
                  disabled={isParsingResume}
                />
                <label htmlFor="resume-upload" className="cursor-pointer">
                  {isParsingResume ? (
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
                  ) : (
                    <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  )}
                  <p className="text-lg font-semibold mb-1">
                    {isParsingResume ? "Parsing Resume..." : "Upload Your Resume"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports PDF, DOCX, and TXT files
                  </p>
                </label>
              </div>

              {resumeText && (
                <div className="bg-background/50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="font-semibold">Resume Loaded</span>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {resumeText.length} characters • Ready to generate questions
                  </p>
                </div>
              )}

              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">Or paste your resume text:</p>
                <textarea
                  className="w-full h-32 p-4 rounded-lg bg-background border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Paste your resume content here..."
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                />
              </div>

              <Button
                size="lg"
                className="w-full bg-primary hover:bg-primary/90"
                onClick={generateQuestions}
                disabled={!resumeText.trim() || isGeneratingQuestions}
              >
                {isGeneratingQuestions ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating Questions...
                  </>
                ) : (
                  <>
                    Generate Interview Questions
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Interview Practice View
  const currentQuestion = questions[currentQuestionIndex];
  const hasAnsweredCurrent = results.length > currentQuestionIndex;

  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/practice")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Exit Interview
          </Button>
          <div className="text-sm text-muted-foreground">
            Question {currentQuestionIndex + 1} of {questions.length}
          </div>
        </div>

        {candidateSummary && !interviewStarted && (
          <Card className="p-6 bg-gradient-card border-border mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Candidate Profile Summary</h3>
              {extractionConfidence && (
                <span className={`text-xs px-2 py-1 rounded ${
                  extractionConfidence.overallQuality === 'high' ? 'bg-green-500/20 text-green-500' :
                  extractionConfidence.overallQuality === 'medium' ? 'bg-yellow-500/20 text-yellow-500' :
                  'bg-red-500/20 text-red-500'
                }`}>
                  Extraction Quality: {extractionConfidence.overallQuality}
                </span>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground mb-4">{candidateSummary}</p>
            
            {/* NER-KE Extracted Entities Display */}
            {extractedEntities && (
              <div className="bg-background/50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  NER-KE Extracted Entities
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {/* Skills */}
                  {extractedEntities.skills && extractedEntities.skills.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Skills ({extractedEntities.skills.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {extractedEntities.skills.slice(0, 10).map((skill, i) => (
                          <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                            {skill}
                          </span>
                        ))}
                        {extractedEntities.skills.length > 10 && (
                          <span className="text-xs text-muted-foreground">+{extractedEntities.skills.length - 10} more</span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Projects */}
                  {extractedEntities.projects && extractedEntities.projects.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Projects ({extractedEntities.projects.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {extractedEntities.projects.map((proj, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-xs">
                            {proj.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Experience */}
                  {extractedEntities.experience && extractedEntities.experience.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Experience ({extractedEntities.experience.length})</p>
                      <div className="space-y-1">
                        {extractedEntities.experience.map((exp, i) => (
                          <p key={i} className="text-xs">
                            <span className="font-medium">{exp.role}</span>
                            <span className="text-muted-foreground"> at {exp.company}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Education */}
                  {extractedEntities.education && extractedEntities.education.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Education ({extractedEntities.education.length})</p>
                      <div className="space-y-1">
                        {extractedEntities.education.map((edu, i) => (
                          <p key={i} className="text-xs">
                            <span className="font-medium">{edu.degree}</span>
                            <span className="text-muted-foreground"> from {edu.institution}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Extraction Stats */}
                {extractionConfidence && (
                  <div className="mt-3 pt-3 border-t border-border flex gap-4 text-xs text-muted-foreground">
                    <span>Skills: {extractionConfidence.skillsFound}</span>
                    {extractionConfidence.projectsFound !== undefined && <span>Projects: {extractionConfidence.projectsFound}</span>}
                    {extractionConfidence.experienceFound !== undefined && <span>Experience: {extractionConfidence.experienceFound}</span>}
                    {extractionConfidence.educationFound !== undefined && <span>Education: {extractionConfidence.educationFound}</span>}
                  </div>
                )}
              </div>
            )}
            
            <Button className="mt-2" onClick={() => setInterviewStarted(true)}>
              Start Interview
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        )}

        {interviewStarted && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Video Area */}
            <div className="lg:col-span-2">
              <Card className="p-6 bg-gradient-card border-border">
                {/* Question Display */}
                <div className="mb-4 p-4 bg-primary/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-1 rounded bg-primary/20 text-primary">
                      {currentQuestion.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Assessing: {currentQuestion.skillAssessed}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold">{currentQuestion.question}</h2>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Tip: {currentQuestion.answerTip}
                  </p>
                </div>

                {/* Video Preview */}
                <div className="relative aspect-video bg-background rounded-lg overflow-hidden mb-4">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

                  {!isCameraOn && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/90">
                      <div className="text-center">
                        <Camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">Turn on camera to start</p>
                      </div>
                    </div>
                  )}

                  {isRecording && (
                    <>
                      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-2 bg-red-500/90 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-sm font-medium text-white">{formatTime(recordingTime)}</span>
                      </div>
                      {(transcript || interimTranscript) && (
                        <div className="absolute bottom-4 left-4 right-4 px-4 py-3 bg-background/90 rounded-lg max-h-24 overflow-y-auto">
                          <p className="text-sm">
                            {transcript} <span className="text-muted-foreground italic">{interimTranscript}</span>
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Controls */}
                <div className="flex flex-wrap justify-center gap-4">
                  {!isCameraOn ? (
                    <Button size="lg" onClick={startCamera}>
                      <Camera className="w-5 h-5 mr-2" /> Turn On Camera
                    </Button>
                  ) : (
                    <>
                      <Button size="lg" variant="outline" onClick={stopCamera}>
                        <VideoOff className="w-5 h-5 mr-2" /> Stop Camera
                      </Button>
                      <Button size="lg" variant="outline" onClick={toggleMicrophone}>
                        {isMicOn ? <Mic className="w-5 h-5 mr-2" /> : <MicOff className="w-5 h-5 mr-2" />}
                        {isMicOn ? "Mic On" : "Mic Off"}
                      </Button>

                      {!isRecording && !hasAnsweredCurrent ? (
                        <>
                          <Button size="lg" onClick={startRecording} disabled={!modelsLoaded || isEvaluating}>
                            <Video className="w-5 h-5 mr-2" />
                            {modelsLoaded ? "Start Answer" : "Loading..."}
                          </Button>
                          <Button size="lg" variant="outline" onClick={skipQuestion} disabled={isEvaluating}>
                            <SkipForward className="w-5 h-5 mr-2" /> Skip Question
                          </Button>
                        </>
                      ) : isRecording ? (
                        <Button size="lg" variant="destructive" onClick={stopRecording}>
                          <Square className="w-5 h-5 mr-2" /> Submit Answer
                        </Button>
                      ) : (
                        <Button size="lg" onClick={nextQuestion}>
                          {currentQuestionIndex < questions.length - 1 ? (
                            <>Next Question <ArrowRight className="w-5 h-5 ml-2" /></>
                          ) : (
                            <>View Results <CheckCircle className="w-5 h-5 ml-2" /></>
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            </div>

            {/* Metrics Panel */}
            <div>
              <Card className="p-6 bg-gradient-card border-border">
                <h3 className="text-lg font-bold mb-4">Real-Time Metrics</h3>

                {isEvaluating ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Evaluating your answer...</p>
                  </div>
                ) : isRecording && currentMetrics ? (
                  <div className="space-y-4">
                    {/* AI Vision Indicators */}
                    {aiVisionMetrics && (
                      <div className="mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-xs text-muted-foreground mb-2">Gemini 2.5 Pro Analysis</p>
                        <div className="flex flex-wrap gap-2">
                          {aiVisionMetrics.detectedEmotion && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              aiVisionMetrics.detectedEmotion === 'happy' || aiVisionMetrics.detectedEmotion === 'confident' 
                                ? 'bg-accent text-accent-foreground' 
                                : aiVisionMetrics.detectedEmotion === 'nervous' || aiVisionMetrics.detectedEmotion === 'stressed'
                                ? 'bg-destructive/20 text-destructive'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              😊 {aiVisionMetrics.detectedEmotion}
                            </span>
                          )}
                          {aiVisionMetrics.gestureType && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              aiVisionMetrics.gestureType === 'open' || aiVisionMetrics.gestureType === 'expressive'
                                ? 'bg-accent text-accent-foreground'
                                : aiVisionMetrics.gestureType === 'closed' || aiVisionMetrics.gestureType === 'fidgeting'
                                ? 'bg-destructive/20 text-destructive'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              👐 {aiVisionMetrics.gestureType}
                            </span>
                          )}
                          {aiVisionMetrics.postureType && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              aiVisionMetrics.postureType === 'upright' || aiVisionMetrics.postureType === 'relaxed'
                                ? 'bg-accent text-accent-foreground'
                                : aiVisionMetrics.postureType === 'slouched' || aiVisionMetrics.postureType === 'tense'
                                ? 'bg-destructive/20 text-destructive'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              🧍 {aiVisionMetrics.postureType}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {(['eyeContact', 'posture', 'speechClarity', 'bodyLanguage', 'voiceQuality'] as const).map(key => (
                      <div key={key}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm text-muted-foreground capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className="text-sm font-bold text-primary">{currentMetrics[key]}%</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-primary transition-all duration-300" 
                            style={{ width: `${currentMetrics[key]}%` }} 
                          />
                        </div>
                      </div>
                    ))}
                    <div className="pt-4 border-t border-border text-center">
                      <p className="text-xs text-muted-foreground mb-1">Overall Score</p>
                      <p className="text-3xl font-bold text-primary">{currentMetrics.overallScore}%</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">
                      {hasAnsweredCurrent ? "Answer submitted!" : "Start answering to see metrics"}
                    </p>
                  </div>
                )}

                {/* Progress */}
                <div className="mt-6 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Progress</p>
                  <div className="flex gap-1">
                    {questions.map((_, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 h-2 rounded-full ${
                          idx < results.length
                            ? 'bg-green-500'
                            : idx === currentQuestionIndex
                            ? 'bg-primary'
                            : 'bg-secondary'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewPractice;
