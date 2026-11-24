"use client";

/**
 * AI Chat — the persistent trading copilot.
 *
 * Grounded by construction: the assistant can only speak from the product's
 * own analysis cache, the user's paper ledger and their journal. Anything
 * outside that is answered with an explicit "I don't have that data".
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, Database, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiRequestError, api } from "@/lib/client/api";
import { useSession } from "@/lib/client/store";
import { Alert, Button, Skeleton, useToast } from "@/components/ui";
import { fmtTimeAgo } from "@/lib/format";
import type { ChatBlock, ChatMessage } from "@/lib/types";

interface ChatResponse {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  symbols: string[];
  usage: { used: number; limit: number | null; remaining: number | null };
}

const SUGGESTIONS = [
  "Analyze BTC/USD",
  "Find potential opportunities",
  "Compare BTC and ETH",
  "Why is gold moving?",
  "Calculate my position size",
  "Review my last 20 trades",
  "What should I watch today?",
];

export function ChatWorkspace() {
  const { usage, refresh } = useSession();
  const { push: toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitInfo, setLimitInfo] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api
      .get<{ messages: ChatMessage[] }>("/api/chat")
      .then((d) => setMessages(d.messages))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    setError(null);
    setLimitInfo(null);
    setSending(true);

    // Optimistic user bubble; replaced by the server copy when it returns.
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: tempId, role: "user", content, createdAt: Date.now() },
    ]);

    try {
      const res = await api.post<ChatResponse>("/api/chat", { message: content });
      setMessages((m) => [
        ...m.filter((x) => x.id !== tempId),
        res.userMessage,
        res.assistantMessage,
      ]);
      void refresh();
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      if (err instanceof ApiRequestError && err.code === "PLAN_LIMIT") {
        setLimitInfo(err.message);
      } else {
        setError(err instanceof ApiRequestError ? err.message : "The copilot could not respond.");
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const clear = async () => {
    await api.del("/api/chat").catch(() => {});
    setMessages([]);
    toast("Conversation cleared");
  };

  const remaining = usage?.chatsLimit != null ? Math.max(0, usage.chatsLimit - (usage.chatsUsedToday ?? 0)) : null;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col sm:h-[calc(100vh-8.5rem)]">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[6px] border border-[#d9a44133] bg-accent-soft">
            <Brain className="size-3.5 text-accent" strokeWidth={1.9} />
          </span>
          <div>
            <div className="text-[13px] font-semibold leading-tight">AI Trading Copilot</div>
            <div className="text-[10px] text-ink-4">
              Grounded in this workspace&apos;s data
              {remaining != null && ` · ${remaining} messages left today`}
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2 className="size-3.5" strokeWidth={1.8} />
            Clear
          </Button>
        )}
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-lg py-6">
            <div className="mb-4 flex size-9 items-center justify-center rounded-[8px] border border-[#d9a44133] bg-accent-soft">
              <Sparkles className="size-4 text-accent" strokeWidth={1.9} />
            </div>
            <h2 className="text-[16px] font-semibold tracking-[-0.015em]">
              Ask anything about the market you&apos;re looking at
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
              I can analyse instruments, rank opportunities, size positions, review your journal and explain
              any setup in the workspace. I only use data that is actually connected — if I don&apos;t have
              it, I&apos;ll say so instead of guessing.
            </p>
            <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-[6px] border border-hairline-2 bg-surface px-2.5 py-2 text-left text-[11.5px] text-ink-2 transition-colors hover:border-[#3a4049] hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-[6px] border border-hairline bg-surface px-2.5 py-2">
              <Database className="mt-0.5 size-3 shrink-0 text-ink-4" strokeWidth={1.8} />
              <p className="text-[10px] leading-relaxed text-ink-4">
                Data available: market prices & candles, AI analyses run in this workspace, your paper
                positions, your journal. Not available: news wires, social sentiment, order flow, funding
                rates, brokerage balances.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {sending && (
              <div className="flex gap-2.5">
                <Avatar role="assistant" />
                <div className="flex items-center gap-1.5 rounded-[8px] border border-hairline bg-surface px-3 py-2.5">
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-4 [animation-delay:-0.2s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-4 [animation-delay:-0.1s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-4" />
                  <span className="ml-1.5 text-[10.5px] text-ink-4">Reading workspace data…</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* errors */}
      {error && (
        <div className="pb-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {limitInfo && (
        <div className="pb-2">
          <Alert
            tone="warn"
            title="Daily copilot limit reached"
            action={
              <Link href="/app/settings?tab=billing" className="whitespace-nowrap rounded-[5px] bg-accent px-2 py-1 text-[10.5px] font-semibold text-accent-ink">
                Upgrade
              </Link>
            }
          >
            {limitInfo}
          </Alert>
        </div>
      )}

      {/* composer */}
      <div className="border-t border-hairline pt-2.5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-[9px] border border-hairline-2 bg-surface p-1.5 focus-within:border-[#3d444e]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Ask about an instrument, a setup, or your own trading…"
              className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[12.5px] text-ink placeholder:text-ink-4 focus:outline-none"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
            <button
              onClick={() => void send()}
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-accent text-accent-ink transition-opacity disabled:opacity-35"
            >
              <ArrowUp className="size-4" strokeWidth={2.4} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[9.5px] text-ink-4">
            Analysis and educational information only — not investment advice, and not a guarantee of results.
          </p>
        </div>
      </div>
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "assistant") {
    return (
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-[#d9a44133] bg-accent-soft">
        <Brain className="size-3 text-accent" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-hairline-2 bg-surface-3 text-[9px] font-semibold text-ink-2">
      You
    </span>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[85%] rounded-[8px] rounded-tr-[2px] bg-surface-3 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          {message.content}
        </div>
      </div>
    );
  }

  const paragraphs = message.content.split("\n\n");

  return (
    <div className="flex gap-2.5">
      <Avatar role="assistant" />
      <div className="min-w-0 flex-1">
        <div className="space-y-2">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed text-ink-2">
              {renderInline(p)}
            </p>
          ))}
        </div>

        {message.blocks?.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9.5px] text-ink-4">
          <span>{fmtTimeAgo(message.createdAt)}</span>
          {message.sources?.length ? (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Database className="size-2.5" strokeWidth={2} />
                {message.sources.join(" · ")}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Minimal inline formatting: **bold** only. No HTML injection surface. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function BlockView({ block }: { block: ChatBlock }) {
  if (block.type === "levels") {
    return (
      <div className="mt-2 overflow-hidden rounded-[7px] border border-hairline bg-surface">
        <div className="border-b border-hairline px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.07em] text-ink-3">
          {block.symbol} — levels
        </div>
        <div className="divide-y divide-[#1a1e24]">
          {block.rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between px-2.5 py-1.5">
              <span className="text-[10.5px] text-ink-3">{r.label}</span>
              <span className="tnum text-[11.5px] text-ink">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === "table") {
    return (
      <div className="mt-2 overflow-hidden rounded-[7px] border border-hairline bg-surface">
        <div className="border-b border-hairline px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.07em] text-ink-3">
          {block.title}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px]">
            <thead>
              <tr className="border-b border-hairline">
                {block.columns.map((c) => (
                  <th key={c} className="px-2.5 py-1.5 text-left font-medium text-ink-4">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-[#1a1e24] last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="tnum whitespace-nowrap px-2.5 py-1.5 text-ink-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (block.type === "note") {
    return (
      <div
        className={cn(
          "mt-2 rounded-[6px] border px-2.5 py-2 text-[10.5px] leading-relaxed",
          block.tone === "warn" ? "border-[#d9a44133] bg-accent-soft text-[#e6c894]" : "border-[#6f9fd833] bg-[#6f9fd80f] text-[#a8c6e6]",
        )}
      >
        {block.text}
      </div>
    );
  }

  if (block.type === "link") {
    return (
      <Link
        href={block.href}
        className="mt-2 inline-flex items-center gap-1 rounded-[5px] border border-hairline-2 bg-surface px-2.5 py-1.5 text-[11px] text-accent hover:border-[#3a4049]"
      >
        {block.label}
      </Link>
    );
  }

  return null;
}
