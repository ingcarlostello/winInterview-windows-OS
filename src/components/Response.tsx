import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Bot, Zap } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";
import type { Status } from "../stores/interview";

function getBadgeKey(status: Status, hasContent: boolean) {
  if (hasContent && status === "responding") return "badgeResponding";
  if (status === "thinking") return "badgeThinking";
  if (status === "listening") return "badgeListening";
  return "badgeReady";
}

function getBadgeColor(status: Status, hasContent: boolean) {
  if (hasContent && status === "responding") return "bg-accent/20 text-accent";
  if (status === "thinking") return "bg-yellow-500/20 text-yellow-400";
  if (status === "listening") return "bg-green-500/20 text-green-400";
  return "bg-white/5 text-white/30";
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

  const textToRender = status === "responding" ? `${fullText}▎` : fullText;

  const badgeKey = getBadgeKey(status, hasContent);
  const badgeColor = getBadgeColor(status, hasContent);

  return (
    <div className="px-3 pb-2 flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 mt-1">
          <Bot className="w-3.5 h-3.5 text-accent/80" />
          <p className="text-[10px] uppercase tracking-wider text-accent/80 font-medium">
            {t("aiCopilot")}
          </p>
          {(status === "listening" || status === "thinking" || status === "responding") && (
            <svg className="w-3.5 h-3.5 text-accent icon-spin" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${badgeColor}`}>
            {t(badgeKey)}
          </span>
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
      </div>
      <div className="border border-accent-border rounded-lg bg-black/30 px-3 py-2 flex-1 overflow-y-auto scrollbar-thin min-h-[80px]">
        {isThinking ? (
          <div className="flex items-center gap-2 text-accent/60 text-sm">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent/60 dot-pulse-anim" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-accent/60 dot-pulse-anim" style={{ animationDelay: "200ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-accent/60 dot-pulse-anim" style={{ animationDelay: "400ms" }} />
            </span>
            <span className="text-xs">{t("generatingResponse")}</span>
          </div>
        ) : hasContent ? (
          <div className="text-accent text-sm leading-relaxed prose prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <table className="w-full border-collapse border border-accent/20 rounded mt-2 mb-2">
                    {children}
                  </table>
                ),
                thead: ({ children }) => (
                  <thead className="bg-accent-soft-2">{children}</thead>
                ),
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr className="border-b border-accent/10">{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="border border-accent/20 px-3 py-1.5 text-left font-semibold text-accent-hover">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-accent/20 px-3 py-1.5">{children}</td>
                ),
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
              {textToRender}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-4">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-accent/60" />
            </div>
            <p className="text-[13px] text-white/25 font-medium">
              {t("copilotReady")}
            </p>
            <p className="text-[10px] text-white/15 text-center max-w-[260px] leading-relaxed">
              {t("copilotReadyDesc")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}