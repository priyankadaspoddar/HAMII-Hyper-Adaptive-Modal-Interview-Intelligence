import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, Mic, MicOff, Video, VideoOff, Square, ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VisionAnalyzer } from "@/lib/visionAnalysis";
import { AudioAnalyzer } from "@/lib/audioAnalysis";
import { SpeechRecognitionService, SpeechAnalyzer } from "@/lib/speechRecognition";
import { ContentAnalyzer } from "@/lib/contentAnalysis";
import { FusionAlgorithm } from "@/lib/fusionAlgorithm";
import type { RawMetrics } from "@/lib/fusionAlgorithm";
import CategorySelection, { type UserCategory } from "@/components/CategorySelection";
import { Zap, Brain, Cpu, BarChart3, ArrowDown, Activity } from "lucide-react";

const Practice = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState<UserCategory | null>(
    (location.state?.category as UserCategory) || null
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const [metrics, setMetrics] = useState({
    eyeContact: 0,
    posture: 0,
    clarity: 0,
    engagement: 0,
    pitch: 0,
    volume: 0,
    gestureVariety: 0,
    emotion: 'neutral',
  });

  const [feedback, setFeedback] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(true);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  const visionAnalyzerRef = useRef<VisionAnalyzer | null>(null);
  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionService | null>(null);
  const speechAnalyzerRef = useRef<SpeechAnalyzer>(new SpeechAnalyzer());
  const contentAnalyzerRef = useRef<ContentAnalyzer>(new ContentAnalyzer());
  const fusionAlgorithmRef = useRef<FusionAlgorithm>(new FusionAlgorithm());
  const animationFrameRef = useRef<number | null>(null);
  const lastBackendAnalysisRef = useRef<number>(0);

  // Initialize advanced AI/ML models on mount
  useEffect(() => {
    const init = async () => {
      try {
        console.log("Initializing advanced AI/ML models (MediaPipe)...");
        visionAnalyzerRef.current = new VisionAnalyzer();
        await visionAnalyzerRef.current.initialize();
        setModelsLoaded(true);
        console.log("MediaPipe models loaded successfully");

        toast({
          title: "AI Models Ready",
          description: "MediaPipe Face Mesh (468 landmarks), Pose (33 keypoints), YIN pitch detection, SNR clarity, TF-IDF, and sentiment analysis ready",
        });
      } catch (error) {
        console.error("Failed to initialize AI models:", error);
        setModelsLoaded(true);
        toast({
          title: "Model Loading Warning",
          description: "Some advanced features may be limited",
          variant: "destructive",
        });
      }
    };
    init();

    // Initialize speech recognition
    const speechService = new SpeechRecognitionService();
    if (!speechService.isSupported()) {
      setSpeechRecognitionSupported(false);
      toast({
        title: "Speech Recognition Unavailable",
        description: "Your browser doesn't support speech recognition. Try Chrome or Edge.",
        variant: "destructive",
      });
    } else {
      speechRecognitionRef.current = speechService;

      speechService.onTranscript((text, isFinal) => {
        if (isFinal) {
          setFinalTranscript(prev => prev + ' ' + text);
          setInterimTranscript('');
          speechAnalyzerRef.current.analyzeTranscript(text);
        } else {
          setInterimTranscript(text);
        }
      });

      speechService.onError((error) => {
        console.error('Speech recognition error:', error);
        if (error === 'not-allowed') {
          toast({
            title: "Microphone Permission Required",
            description: "Please allow microphone access for speech analysis",
            variant: "destructive",
          });
        }
      });
    }

    return () => {
      if (visionAnalyzerRef.current) visionAnalyzerRef.current.cleanup();
      if (audioAnalyzerRef.current) audioAnalyzerRef.current.cleanup();
      if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
    };
  }, [toast]);

  // Real-time analysis loop
  useEffect(() => {
    if (!isRecording || !videoRef.current || !canvasRef.current) return;

    const analyzeFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(analyzeFrame);
        return;
      }

      const timestamp = performance.now();

      try {
        const visionMetrics = visionAnalyzerRef.current
          ? await visionAnalyzerRef.current.analyzeFrame(video, timestamp)
          : null;

        // Draw landmarks
        const overlayCanvas = overlayCanvasRef.current;
        if (overlayCanvas && visionMetrics) {
          overlayCanvas.width = video.videoWidth;
          overlayCanvas.height = video.videoHeight;
          const ctx = overlayCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            // Face mesh
            if (visionMetrics.face.landmarks?.length > 0) {
              ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
              visionMetrics.face.landmarks.forEach((landmark: any) => {
                const x = landmark.x * overlayCanvas.width;
                const y = landmark.y * overlayCanvas.height;
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, 2 * Math.PI);
                ctx.fill();
              });
            }

            // Pose
            if (visionMetrics.posture.landmarks?.length > 0) {
              ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
              ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
              ctx.lineWidth = 2;

              visionMetrics.posture.landmarks.forEach((landmark: any) => {
                const x = landmark.x * overlayCanvas.width;
                const y = landmark.y * overlayCanvas.height;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
              });

              const connections = [
                [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
                [11, 23], [12, 24], [23, 24],
                [23, 25], [25, 27], [24, 26], [26, 28],
                [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8]
              ];

              connections.forEach(([start, end]) => {
                const landmarks = visionMetrics.posture.landmarks;
                if (landmarks[start] && landmarks[end]) {
                  const startX = landmarks[start].x * overlayCanvas.width;
                  const startY = landmarks[start].y * overlayCanvas.height;
                  const endX = landmarks[end].x * overlayCanvas.width;
                  const endY = landmarks[end].y * overlayCanvas.height;
                  ctx.beginPath();
                  ctx.moveTo(startX, startY);
                  ctx.lineTo(endX, endY);
                  ctx.stroke();
                }
              });
            }
          }
        }

        const audioFeatures = audioAnalyzerRef.current?.getAudioFeatures() || null;
        const speechMetrics = speechAnalyzerRef.current.getMetrics();
        const contentMetrics = finalTranscript.length > 20
          ? contentAnalyzerRef.current.analyzeContent(finalTranscript)
          : null;

        if (visionMetrics && audioFeatures) {
          const rawMetrics: RawMetrics = {
            eyeContact: visionMetrics.face.eyeContact,
            emotion: visionMetrics.face.emotion,
            emotionConfidence: visionMetrics.face.emotionConfidence,
            postureScore: visionMetrics.posture.postureScore,
            shoulderAlignment: visionMetrics.posture.shoulderAlignment,
            headPosition: visionMetrics.posture.headPosition,
            gestureVariety: visionMetrics.gestures.gestureVariety,
            handVisibility: visionMetrics.gestures.handVisibility,

            pitch: audioFeatures.pitch,
            pitchVariation: audioFeatures.pitchVariation,
            volume: audioFeatures.volume,
            volumeVariation: audioFeatures.volumeVariation,
            clarity: audioFeatures.clarity,
            energy: audioFeatures.energy,

            wordsPerMinute: speechMetrics.wordsPerMinute,
            fillerCount: speechMetrics.fillerCount,
            fillerPercentage: speechMetrics.fillerPercentage,
            clarityScore: speechMetrics.clarityScore,
            fluencyScore: speechMetrics.fluencyScore,
            articulationScore: speechMetrics.articulationScore,
          };

          fusionAlgorithmRef.current.setContext(selectedCategory || 'students');
          const fusedMetrics = fusionAlgorithmRef.current.fuse(rawMetrics);

          const contentBoost = contentMetrics ? (contentMetrics.coherenceScore / 100) * 10 : 0;
          const newMetrics = {
            eyeContact: fusedMetrics.eyeContact,
            posture: fusedMetrics.posture,
            clarity: fusedMetrics.speechClarity,
            engagement: Math.min(100, fusedMetrics.contentEngagement + contentBoost),
            pitch: audioFeatures.pitch,
            volume: audioFeatures.volume,
            gestureVariety: fusedMetrics.bodyLanguage,
            emotion: visionMetrics.face.emotion,
          };

          setMetrics(newMetrics);

          const feedbackParts = [];
          if (fusedMetrics.eyeContact < 50) feedbackParts.push("Improve eye contact");
          if (fusedMetrics.posture < 60) feedbackParts.push("Straighten your posture");
          if (speechMetrics.wordsPerMinute > 150) feedbackParts.push("Slow down - speak at 120-150 WPM");
          if (speechMetrics.wordsPerMinute < 80 && speechMetrics.wordsPerMinute > 0) feedbackParts.push("Speak faster");
          if (audioFeatures.volume < -40) feedbackParts.push("Speak louder");
          if (fusedMetrics.bodyLanguage < 40) feedbackParts.push("Use more hand gestures");
          if (speechMetrics.fillerPercentage > 10) feedbackParts.push(`Reduce filler words (${speechMetrics.fillerPercentage}%)`);
          if (contentMetrics && contentMetrics.coherenceScore < 60) feedbackParts.push("Improve flow and coherence");
          if (contentMetrics && contentMetrics.sentimentLabel === 'negative') feedbackParts.push("Use more positive language");
          if (fusedMetrics.confidence < 50) feedbackParts.push("Low signal quality");

          setFeedback(feedbackParts.length > 0 ? feedbackParts.join(" • ") : "Excellent! Keep it up!");
        }

        // Backend analysis every 15s
        const now = Date.now();
        if (now - lastBackendAnalysisRef.current > 15000 && finalTranscript.length > 50) {
          lastBackendAnalysisRef.current = now;
          const context = canvas.getContext("2d");
          if (context) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0);
            const imageData = canvas.toDataURL("image/jpeg", 0.8);
            const { error } = await supabase.functions.invoke('analyze-presentation', {
              body: { imageData, transcript: finalTranscript }
            });
            if (error) console.error('Backend error:', error);
          }
        }
      } catch (error) {
        console.error("Error analyzing frame:", error);
      }

      animationFrameRef.current = requestAnimationFrame(analyzeFrame);
    };

    analyzeFrame();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isRecording, finalTranscript]);

  // Audio level monitoring
  useEffect(() => {
    if (!isRecording) {
      setAudioLevel(0);
      return;
    }
    const update = () => {
      if (audioAnalyzerRef.current) {
        const features = audioAnalyzerRef.current.getAudioFeatures();
        const normalized = Math.max(0, Math.min(100, (features.volume + 60) * 1.67));
        setAudioLevel(Math.round(normalized));
      }
      if (isRecording) requestAnimationFrame(update);
    };
    update();
  }, [isRecording]);

  // Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      setStream(mediaStream);
      setIsCameraOn(true);
      setIsMicOn(true);
      toast({ title: "Camera Ready", description: "Camera and microphone are now active" });
    } catch (error) {
      console.error("Camera error:", error);
      toast({ title: "Camera Access Denied", description: "Please allow access", variant: "destructive" });
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

  const startRecording = () => {
    if (!isCameraOn || !modelsLoaded || !stream) return;

    setIsRecording(true);
    setRecordingTime(0);
    setFinalTranscript("");
    setInterimTranscript("");
    setFeedback("");
    speechAnalyzerRef.current.reset();
    contentAnalyzerRef.current.reset();
    fusionAlgorithmRef.current.reset();
    lastBackendAnalysisRef.current = 0;

    audioAnalyzerRef.current = new AudioAnalyzer();
    audioAnalyzerRef.current.initialize(stream);

    if (speechRecognitionRef.current && speechRecognitionSupported) {
      const started = speechRecognitionRef.current.start();
      if (!started) {
        toast({ title: "Speech Recognition Failed", description: "Could not start", variant: "destructive" });
      }
    }

    toast({
      title: "Recording Started",
      description: "Real-time AI analysis active",
    });
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
    if (audioAnalyzerRef.current) audioAnalyzerRef.current.cleanup();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    const finalAnalysis = speechAnalyzerRef.current.getMetrics();
    toast({ title: "Recording Stopped", description: "Analyzing session..." });

    setTimeout(() => {
      const contentMetrics = finalTranscript.length > 20
        ? contentAnalyzerRef.current.analyzeContent(finalTranscript)
        : null;

      navigate("/results", {
        state: {
          duration: recordingTime,
          metrics,
          transcript: finalTranscript,
          speechAnalysis: finalAnalysis,
          contentAnalysis: contentMetrics,
          feedback,
          category: selectedCategory,
        }
      });
    }, 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  if (!selectedCategory) {
    return <CategorySelection onSelect={setSelectedCategory} />;
  }

  return (
    <div className="min-h-screen bg-gradient-hero p-4">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Categories
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-12">
          {/* Video Area */}
          <div className="lg:col-span-2">
            <Card className="p-6 bg-gradient-card border-border">
              <div className="relative aspect-video bg-background rounded-lg overflow-hidden mb-4">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ objectFit: 'cover' }} />

                {!isCameraOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/90">
                    <div className="text-center">
                      <Camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">Camera is off</p>
                    </div>
                  </div>
                )}

                {isRecording && (
                  <>
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-primary/90 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-medium text-white">Live AI Analysis</span>
                      </div>
                      {(finalTranscript || interimTranscript) && (
                        <div className="px-3 py-2 bg-background/90 rounded-lg max-w-md max-h-32 overflow-y-auto">
                          <p className="text-xs text-foreground">
                            {finalTranscript} <span className="text-muted-foreground italic">{interimTranscript}</span>
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="absolute top-4 right-4 px-4 py-2 bg-background/90 rounded-full">
                      <span className="text-lg font-bold text-primary">{formatTime(recordingTime)}</span>
                    </div>
                    {feedback && (
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="px-4 py-3 bg-primary/90 rounded-lg">
                          <p className="text-sm font-medium text-white">{feedback}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* CONTROLS */}
              <div className="flex flex-wrap justify-center gap-4 items-center">
                {!isCameraOn ? (
                  <Button size="lg" onClick={startCamera} className="bg-primary hover:bg-primary/90">
                    <Camera className="w-5 h-5 mr-2" /> Turn On Camera
                  </Button>
                ) : (
                  <>
                    <Button size="lg" variant="outline" onClick={stopCamera} className="border-border">
                      <VideoOff className="w-5 h-5 mr-2" /> Stop Camera
                    </Button>

                    <Button size="lg" variant="outline" onClick={toggleMicrophone} className="border-border">
                      {isMicOn ? (
                        <> <Mic className="w-5 h-5 mr-2" /> Mic On </>
                      ) : (
                        <> <MicOff className="w-5 h-5 mr-2" /> Mic Off </>
                      )}
                    </Button>

                    <select
                      className="px-4 py-2 text-sm rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      onChange={(e) => speechRecognitionRef.current?.setLanguage(e.target.value as "en" | "hi" | "te")}
                      defaultValue="en"
                    >
                      <option value="en">English</option>
                      <option value="hi">हिंदी (Hindi)</option>
                      <option value="te">తెలుగు (Telugu)</option>
                    </select>

                    {!isRecording ? (
                      <Button
                        size="lg"
                        onClick={startRecording}
                        className="bg-primary hover:bg-primary/90"
                        disabled={!modelsLoaded}
                      >
                        <Video className="w-5 h-5 mr-2" />
                        {modelsLoaded ? "Start Recording" : "Loading AI..."}
                      </Button>
                    ) : (
                      <Button size="lg" onClick={stopRecording} variant="destructive">
                        <Square className="w-5 h-5 mr-2" /> Stop Recording
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>

          {/* Real-Time Analytics */}
          <div className="space-y-4">
            <Card className="p-6 bg-gradient-card border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground">Real-Time AI Analysis</h3>
                <div className="flex items-center gap-2">
                  {!modelsLoaded && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-xs text-primary font-medium">Loading AI Models</span>
                    </div>
                  )}
                  {modelsLoaded && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/30">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                      <span className="text-xs text-accent font-medium">AI Ready</span>
                    </div>
                  )}
                </div>
              </div>

              {!modelsLoaded && (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                  <p className="text-sm font-medium text-foreground mb-1">Initializing AI Models</p>
                  <p className="text-xs text-muted-foreground">Loading MediaPipe Face Mesh, Pose Detection, and Audio Analysis...</p>
                </div>
              )}

              {modelsLoaded && !isRecording && (
                <div className="text-center py-8">
                  <Camera className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Start recording to see live AI analysis</p>
                </div>
              )}

              {isRecording && (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Eye Contact</span>
                      <span className="text-sm font-bold text-primary">{metrics.eyeContact}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-primary transition-all duration-500" style={{ width: `${metrics.eyeContact}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Posture</span>
                      <span className="text-sm font-bold text-primary">{metrics.posture}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-secondary transition-all duration-500" style={{ width: `${metrics.posture}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Clarity</span>
                      <span className="text-sm font-bold text-primary">{metrics.clarity}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-accent transition-all duration-500" style={{ width: `${metrics.clarity}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Engagement</span>
                      <span className="text-sm font-bold text-primary">{metrics.engagement}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-primary transition-all duration-500" style={{ width: `${metrics.engagement}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Audio Level</span>
                      <span className="text-sm font-bold text-primary">{audioLevel}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-accent transition-all duration-100" style={{ width: `${audioLevel}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Emotion</p>
                      <p className="text-sm font-bold text-foreground capitalize">{metrics.emotion}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Gestures</p>
                      <p className="text-sm font-bold text-foreground">{metrics.gestureVariety}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Pitch</p>
                      <p className="text-sm font-bold text-foreground">{metrics.pitch} Hz</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Volume</p>
                      <p className="text-sm font-bold text-foreground">{metrics.volume} dB</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ALGORITHM & FLOWCHART SECTION */}
        <section className="mt-12 space-y-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
              How HAMII Intelligence Works
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our advanced multi-modal fusion algorithm analyzes your performance across multiple dimensions in real-time.
            </p>
          </div>

          {/* Visual Flowchart */}
          <div className="relative max-w-5xl mx-auto bg-gradient-card p-8 rounded-2xl border border-border overflow-x-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 min-w-[800px]">
              {/* Input Node */}
              <div className="flex flex-col items-center text-center group">
                <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 group-hover:scale-110 transition-transform">
                  <Activity className="w-10 h-10 text-primary" />
                </div>
                <h4 className="font-bold mt-4">Multi-Modal Input</h4>
                <p className="text-xs text-muted-foreground">Video • Audio • Speech</p>
              </div>

              <div className="hidden md:block">
                <ArrowDown className="w-8 h-8 text-primary/40 -rotate-90" />
              </div>

              {/* Analyzer Nodes */}
              <div className="flex flex-col gap-4">
                <div className="p-4 bg-background/50 rounded-xl border border-border flex items-center gap-4 hover:border-primary/50 transition-colors">
                  <Camera className="w-6 h-6 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-bold">Vision Analyzer</p>
                    <p className="text-[10px] text-muted-foreground">MediaPipe Landmarkers (FACS)</p>
                  </div>
                </div>
                <div className="p-4 bg-background/50 rounded-xl border border-border flex items-center gap-4 hover:border-primary/50 transition-colors">
                  <Mic className="w-6 h-6 text-accent" />
                  <div className="text-left">
                    <p className="text-sm font-bold">Audio Analyzer</p>
                    <p className="text-[10px] text-muted-foreground">YIN Algorithm • RMS Energy</p>
                  </div>
                </div>
                <div className="p-4 bg-background/50 rounded-xl border border-border flex items-center gap-4 hover:border-primary/50 transition-colors">
                  <Zap className="w-6 h-6 text-secondary" />
                  <div className="text-left">
                    <p className="text-sm font-bold">Speech Recognition</p>
                    <p className="text-[10px] text-muted-foreground">Web Speech API • NLP Patterns</p>
                  </div>
                </div>
              </div>

              <div className="hidden md:block">
                <ArrowDown className="w-8 h-8 text-primary/40 -rotate-90" />
              </div>

              {/* Fusion Hub */}
              <div className="flex flex-col items-center text-center group">
                <div className="w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow-primary group-hover:scale-110 transition-transform">
                  <Cpu className="w-12 h-12 text-white" />
                </div>
                <h4 className="font-bold mt-4">Fusion Engine</h4>
                <p className="text-xs text-muted-foreground">Bayesian Scoring • EMA</p>
              </div>

              <div className="hidden md:block">
                <ArrowDown className="w-8 h-8 text-primary/40 -rotate-90" />
              </div>

              {/* Output Node */}
              <div className="flex flex-col items-center text-center group">
                <div className="w-20 h-20 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/30 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-10 h-10 text-accent" />
                </div>
                <h4 className="font-bold mt-4">Real-Time Feedback</h4>
                <p className="text-xs text-muted-foreground">Analytics • Report Generation</p>
              </div>
            </div>
          </div>

          {/* Technical Details Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6 bg-background/50 border-border hover:border-primary/30 transition-all">
              <Brain className="w-10 h-10 text-primary mb-4" />
              <h4 className="font-bold mb-2">Vision Tech</h4>
              <p className="text-sm text-muted-foreground">
                Uses MediaPipe for 468-point face mesh tracking and 33-point pose detection. Implements FACS (Facial Action Coding System) for micro-expression analysis.
              </p>
            </Card>

            <Card className="p-6 bg-background/50 border-border hover:border-primary/30 transition-all">
              <Activity className="w-10 h-10 text-accent mb-4" />
              <h4 className="font-bold mb-2">Acoustic Analysis</h4>
              <p className="text-sm text-muted-foreground">
                Implements YIN algorithm for precise fundamental frequency tracking. Analyzes RMS energy for volume and SNR for speech clarity.
              </p>
            </Card>

            <Card className="p-6 bg-background/50 border-border hover:border-primary/30 transition-all">
              <Zap className="w-10 h-10 text-secondary mb-4" />
              <h4 className="font-bold mb-2">Speech & NLP</h4>
              <p className="text-sm text-muted-foreground">
                Real-time lexical analysis using TF-IDF for keyword extraction and VADER sentiment analysis for emotional tone detection.
              </p>
            </Card>

            <Card className="p-6 bg-background/50 border-border hover:border-primary/30 transition-all">
              <Cpu className="w-10 h-10 text-primary mb-4" />
              <h4 className="font-bold mb-2">Fusion Logic</h4>
              <p className="text-sm text-muted-foreground">
                Multi-layer weighted aggregation with adaptive temporal smoothing (EMA) to ensure stable and context-aware performance scoring.
              </p>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Practice;
