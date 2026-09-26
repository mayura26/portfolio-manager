"use client";

import { MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { askInvestmentQuestion } from "@/actions/investment-allocator";
import type { InvestmentAllocation } from "@/lib/investment-allocator";
import type { InvestmentChatMessage } from "@/lib/investment-chat";

const suggestions = [
  "Why did you choose these positions?",
  "What about the technology sector?",
  "What would a more defensive allocation look like?",
];

export function InvestmentChat({
  groupId,
  cashToInvest,
  allocation,
}: {
  groupId: string;
  cashToInvest: number;
  allocation: InvestmentAllocation;
}) {
  const [messages, setMessages] = useState<InvestmentChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const limitReached = messages.length >= 40;

  useEffect(() => {
    if (messages.length || pending)
      log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, pending]);

  async function send(question = draft) {
    const content = question.trim();
    if (!content || content.length > 2000 || busy.current || limitReached)
      return;
    busy.current = true;
    setPending(true);
    setError(null);
    setDraft("");
    const next: InvestmentChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(next);
    try {
      const response = await askInvestmentQuestion({
        groupId,
        cashToInvest,
        allocation,
        messages: next,
      });
      if (!response.ok) throw new Error(response.error);
      setMessages([...next, { role: "assistant", content: response.answer }]);
    } catch (err) {
      setMessages(messages);
      setDraft(content);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to send. Please try again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }

  return (
    <section
      className="hairline bg-surface"
      aria-labelledby="investment-chat-title"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2
            id="investment-chat-title"
            className="display flex items-center gap-2 text-xl text-foreground"
          >
            <MessageCircle className="h-5 w-5 text-accent" aria-hidden />{" "}
            Discuss this allocation
          </h2>
          <p className="mt-1 text-xs text-muted">
            Explore the reasoning, compare sectors, or challenge a pick.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="text-xs text-muted hover:text-foreground disabled:opacity-50"
          >
            Clear chat
          </button>
        )}
      </div>
      <div
        ref={log}
        role="log"
        aria-label="Allocation discussion"
        aria-live="polite"
        aria-busy={pending}
        className="max-h-[32rem] space-y-5 overflow-y-auto px-5 py-5"
      >
        {messages.length === 0 && (
          <div>
            <p className="mb-4 text-sm text-muted">
              Ask a follow-up using your recommendation and portfolio as
              context.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={pending}
                  onClick={() => void send(question)}
                  className="hairline px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-background disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={`${index}-${message.role}`}
            className={
              message.role === "user"
                ? "ml-6 border-l-2 border-accent bg-background px-4 py-3 sm:ml-12"
                : "pr-4"
            }
          >
            <p className="label mb-2">
              {message.role === "user" ? "You" : "Portfolio assistant"}
            </p>
            <div className="break-words text-sm leading-relaxed text-foreground [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-accent [&_a]:underline">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {pending && (
          <output className="text-sm text-muted">
            Considering your question…
          </output>
        )}
      </div>
      <form
        className="border-t border-border px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor="allocation-question" className="label">
          Your follow-up
        </label>
        <textarea
          ref={input}
          id="allocation-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={pending || limitReached}
          maxLength={2000}
          rows={3}
          placeholder="What about healthcare instead? How would that affect my risk?"
          className="hairline mt-2 w-full resize-y bg-background px-3 py-2 text-sm text-foreground placeholder:text-subtle disabled:opacity-50"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-loss">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-subtle">
            {limitReached
              ? "Conversation limit reached. Clear chat to start again."
              : "Chat lasts until you leave or generate a new allocation. Alternatives are discussion only."}
          </p>
          <button
            type="submit"
            disabled={pending || !draft.trim() || limitReached}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden />
            {pending ? "Thinking…" : "Ask follow-up"}
          </button>
        </div>
      </form>
    </section>
  );
}
