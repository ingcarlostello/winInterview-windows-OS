import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";

interface CodeProps {
  node?: any;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

export default function Response() {
  const responseChunks = useInterviewStore((s) => s.responseChunks);
  const status = useInterviewStore((s) => s.status);
  const { t } = useTranslation();

  const fullText = responseChunks.join("");
  const hasContent = fullText.length > 0;
  const isThinking = status === "thinking";

  const handleCopy = async () => {
    if (fullText) {
      await navigator.clipboard.writeText(fullText);
    }
  };

  // Append a blinking cursor character to the text while streaming
  const textToRender = status === "responding" ? `${fullText}▎` : fullText;

  return (
    <div className="px-3 pb-2 flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 mt-1">
          <p className="text-[10px] uppercase tracking-wider text-green-400/80 font-medium">
            {t("aiCopilot")}
          </p>
          {(status === "listening" || status === "thinking" || status === "responding") && (
            <svg className="w-3.5 h-3.5 text-green-400 icon-spin" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
            </svg>
          )}
        </div>
        {hasContent && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {t("btnCopy")}
          </button>
        )}
      </div>
      <div className="border border-green-500/30 rounded-lg bg-black/30 px-3 py-2 flex-1 overflow-y-auto scrollbar-thin min-h-[80px]">
        {isThinking ? (
          <div className="flex items-center gap-2 text-green-400/60 text-sm">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 dot-pulse-anim" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 dot-pulse-anim" style={{ animationDelay: "200ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 dot-pulse-anim" style={{ animationDelay: "400ms" }} />
            </span>
            <span className="text-xs">{t("generatingResponse")}</span>
          </div>
        ) : hasContent ? (
          <div className="text-green-400 text-sm leading-relaxed prose prose-invert max-w-none">
            <ReactMarkdown
              components={{
                code({ className, children, ...props }: CodeProps) {
                  const match = /language-(\w+)/.exec(className || "");
                  return match ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {textToRender}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-[14px] text-white/20 italic text-sm text-center py-4">
            {t("placeholderResponse")}
          </p>
        )}
      </div>
    </div>
  );
}