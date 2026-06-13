import { Monitor, Sparkles, RefreshCw, Camera } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";
import { WS_MESSAGE_TYPE, WS_STATUS } from "../constants/ws";
import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const MAX_CAPTURES = 4;
const WS_ANALYZE_URL = "ws://localhost:8000/api/ws/analyze-screens";

export default function ScreenPanel() {
  const screenImages = useInterviewStore((s) => s.screenImages);
  const screenChunks = useInterviewStore((s) => s.screenChunks);
  const isCapturingScreen = useInterviewStore((s) => s.isCapturingScreen);
  const isAnalyzingScreen = useInterviewStore((s) => s.isAnalyzingScreen);
  const screenPrompt = useInterviewStore((s) => s.screenPrompt);
  const addScreenImage = useInterviewStore((s) => s.addScreenImage);
  const clearScreen = useInterviewStore((s) => s.clearScreen);
  const clearScreenChunks = useInterviewStore((s) => s.clearScreenChunks);
  const addScreenChunk = useInterviewStore((s) => s.addScreenChunk);
  const setIsCapturingScreen = useInterviewStore((s) => s.setIsCapturingScreen);
  const setIsAnalyzingScreen = useInterviewStore((s) => s.setIsAnalyzingScreen);
  const setScreenPrompt = useInterviewStore((s) => s.setScreenPrompt);
  const canCaptureScreen = useInterviewStore((s) => s.canCaptureScreen);
  const screenPanelOpen = useInterviewStore((s) => s.screenPanelOpen);

  const wsRef = useRef<WebSocket | null>(null);
  const { t } = useTranslation();

  const hasCaptures = screenImages.length > 0;
  const hasAnalysis = screenChunks.length > 0;
  const canCapture = canCaptureScreen();
  const responseText = screenChunks.join("");

  const handleCapture = useCallback(async () => {
    if (!canCapture) return;

    setIsCapturingScreen(true);

    // Wait for the browser to actually paint the spinner before
    // invoking the Tauri command (which may still briefly block IPC)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    try {
      const img = await invoke<string>("capture_screen");
      addScreenImage(img);
    } catch (error) {
      console.error("Error capturing screen:", error);
    } finally {
      setIsCapturingScreen(false);
    }
  }, [canCapture, addScreenImage, setIsCapturingScreen]);

  const handleAnalyze = useCallback(() => {
    if (screenImages.length === 0 || isAnalyzingScreen) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    setIsAnalyzingScreen(true);
    clearScreenChunks();

    const ws = new WebSocket(WS_ANALYZE_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          images: screenImages,
          prompt: screenPrompt,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === WS_MESSAGE_TYPE.CHUNK) {
          addScreenChunk(data.content);
        } else if (data.type === WS_MESSAGE_TYPE.STATUS && data.status === WS_STATUS.COMPLETED) {
          setIsAnalyzingScreen(false);
          ws.close();
        } else if (data.type === WS_MESSAGE_TYPE.ERROR) {
          console.error("Analysis error:", data.message);
          setIsAnalyzingScreen(false);
          ws.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setIsAnalyzingScreen(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setIsAnalyzingScreen(false);
      ws.close();
    };
  }, [
    screenImages,
    screenPrompt,
    isAnalyzingScreen,
    clearScreenChunks,
    addScreenChunk,
    setIsAnalyzingScreen,
  ]);

  const handleClear = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    clearScreen();
  }, [clearScreen]);

  return (
    <div className="h-full flex flex-col glass-base border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <Monitor className="text-accent" size={16} />
          <span className="text-white font-semibold text-xs">Lector 2</span>
        </div>
        <button
          onClick={handleClear}
          className="text-white/50 hover:text-white/80 text-[10px] font-medium transition-colors cursor-pointer"
        >
          {t("clearScreen")}
        </button>
      </div>

      <div className="border-b border-white/10" />

      {/* Capture Thumbnails */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${hasCaptures ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 shrink-0 overflow-x-auto">
            {screenImages.map((image, index) => (
              <div
                key={index}
                className="scan-line w-[120px] h-[120px] rounded-lg overflow-hidden border border-white/15 bg-black/20 shrink-0"
              >
                <img
                  src={`data:image/jpeg;base64,${image}`}
                  alt={`Captura ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {Array.from({ length: MAX_CAPTURES - screenImages.length }).map(
              (_, index) => (
                <div
                  key={`empty-${index}`}
                  className="w-[120px] h-[120px] rounded-lg bg-white/5 border border-white/10 shrink-0"
                />
              )
            )}
          </div>
        </div>
      </div>


      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-3 py-3 gap-3">
        {/* Capture Area - centered card */}
        {!hasAnalysis && !hasCaptures && (
          <div className={`flex-1 flex items-center justify-center min-h-0 transition-opacity duration-300 ${screenPanelOpen ? "opacity-100 delay-150" : "opacity-0"}`}>
            <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-white/10 bg-black/20 w-[260px] text-center">
              <div className="w-10 h-10 rounded-lg border border-white/15 bg-white/5 flex items-center justify-center">
                <Camera size={18} className="text-white/60" />
              </div>
              <h3 className="text-white text-xs font-semibold leading-tight whitespace-nowrap">
                {t("noScreenCapture")}
              </h3>
              <p className="text-white/50 text-[10px] leading-relaxed">
                {t("screenCaptureDescription")}
              </p>
              <button
                onClick={handleCapture}
                disabled={!canCapture || isCapturingScreen}
                className="mt-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-black text-xs font-semibold hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCapturingScreen ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    {t("capturing")}
                  </>
                ) : (
                  <>
                    <Camera size={12} />
                    {t("screenCaptureButton")}
                  </>
                )}
              </button>
              {!canCapture && (
                <span className="text-accent/60 text-[10px]">
                  {t("captureLimitReached")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Prompt Section - glass container */}
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${hasCaptures && !hasAnalysis ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="text-accent" size={12} />
                <span className="text-accent text-[10px] font-semibold uppercase tracking-wider">
                  {t("promptForLLM")}
                </span>
              </div>
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <textarea
                  value={screenPrompt}
                  onChange={(e) => setScreenPrompt(e.target.value)}
                  placeholder={t("promptPlaceholder")}
                  className="w-full min-h-[80px] bg-black/20 px-3 py-2 text-white text-xs resize-y focus:outline-none focus:bg-black/30 transition-colors"
                />
                <div className="border-t border-white/10 px-3 py-2 flex justify-end">
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzingScreen}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-accent/20 border border-accent-border text-accent text-xs font-medium hover:bg-accent/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzingScreen ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        {t("analyzing")}
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        {t("analyzeScreens")}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Solution Section - glass container */}
        {hasAnalysis && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-1.5 mb-2 shrink-0">
              <Sparkles className="text-accent" size={12} />
              <span className="text-accent text-[10px] font-semibold uppercase tracking-wider">
                {t("solution")}
              </span>
            </div>

            <div className="flex-1 border border-white/10 rounded-xl overflow-hidden min-h-0">
              <div className="h-full overflow-y-auto scrollbar-thin p-3">
                <div className="text-white/85 text-xs leading-relaxed prose prose-invert prose-xs max-w-none mb-12">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: ({ className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || "");
                        const { node, ...rest } = props;
                        void node;
                        return match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                          >
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...rest}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {responseText}
                  </ReactMarkdown>
                </div>

                {isAnalyzingScreen && !responseText && (
                  <div className="flex items-center gap-2 text-accent text-xs">
                    <RefreshCw size={12} className="animate-spin" />
                    <span>{t("analyzing")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Capture Again Button - at bottom when already has captures */}
      {hasCaptures && !hasAnalysis && (
        <>
          <div className="border-b border-white/10 mx-3" />
          <div className="px-3 py-2.5 shrink-0">
            <button
              onClick={handleCapture}
              disabled={!canCapture || isCapturingScreen}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-accent-soft border border-accent-border text-accent text-xs font-medium hover:bg-accent/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCapturingScreen ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  {t("capturing")}
                </>
              ) : (
                <>
                  <RefreshCw size={12} />
                  {t("captureAgain")}
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
