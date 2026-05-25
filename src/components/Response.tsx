import { useInterviewStore } from "../stores/interview";

function parseResponse(text: string) {
  const parts: { type: "bullet" | "code"; content: string; language?: string }[] = [];
  const lines = text.split("\n");
  let codeBlock = "";
  let inCode = false;
  let codeLanguage = "";

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        if (codeBlock.trim()) {
          parts.push({ type: "code", content: codeBlock.trimEnd(), language: codeLanguage });
        }
        codeBlock = "";
        inCode = false;
        codeLanguage = "";
      } else {
        inCode = true;
        codeLanguage = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeBlock += line + "\n";
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      parts.push({ type: "bullet", content: trimmed.slice(2) });
    } else if (trimmed) {
      parts.push({ type: "bullet", content: trimmed });
    }
  }

  if (inCode && codeBlock.trim()) {
    parts.push({ type: "code", content: codeBlock.trimEnd(), language: codeLanguage });
  }

  return parts;
}

export default function Response() {
  const responseChunks = useInterviewStore((s) => s.responseChunks);
  const status = useInterviewStore((s) => s.status);

  const fullText = responseChunks.join("");
  const parts = parseResponse(fullText);

  if (parts.length === 0) return null;

  return (
    <div className="px-3 py-2 flex-1 overflow-y-auto">
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
        Respuesta
      </p>
      <div className="space-y-1">
        {parts.map((part, i) => {
          if (part.type === "code") {
            return (
              <pre
                key={i}
                className="bg-black/30 rounded-md p-2 text-xs text-green-300 font-mono overflow-x-auto"
              >
                <code>{part.content}</code>
              </pre>
            );
          }
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5 shrink-0">•</span>
              <p className="text-white/90 text-sm leading-relaxed">
                {part.content}
                {status === "responding" && i === parts.length - 1 && (
                  <span className="inline-block w-1 h-4 bg-white/60 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
