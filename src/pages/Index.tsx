import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const CHAT_API = "https://functions.poehali.dev/c396e99d-48c0-46cd-b65e-32b13a42d25c";
const HISTORY_API = "https://functions.poehali.dev/f5fcef65-7b12-4c48-95e8-8a404e067efb";
const MEMORY_API = "https://functions.poehali.dev/dd44e6da-9b75-4b61-8eaa-5f39afc5f511";

function getSessionId(): string {
  let sid = localStorage.getItem("xdai-session-id");
  if (!sid) {
    sid = "sess-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("xdai-session-id", sid);
  }
  return sid;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MemoryItem {
  id: string;
  content: string;
  created_at: string;
}

interface Props {
  theme: "dark" | "light";
  toggleTheme: () => void;
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function renderMarkdown(text: string) {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```[\s\S]*?```/g, (block) => {
    const code = block.slice(3, -3).replace(/^[^\n]*\n/, "");
    return `<pre><code>${code}</code></pre>`;
  });

  html = html
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  return `<p>${html}</p>`;
}

function getTimeLabel(ts: string | number) {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) return d.toLocaleDateString("ru", { weekday: "short" });
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-4 py-3">
      <div className="typing-dot w-2 h-2 rounded-full bg-primary" />
      <div className="typing-dot w-2 h-2 rounded-full bg-primary" />
      <div className="typing-dot w-2 h-2 rounded-full bg-primary" />
    </div>
  );
}

export default function Index({ theme, toggleTheme }: Props) {
  const sessionId = getSessionId();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
  const [activeTab, setActiveTab] = useState<"chats" | "memory">("chats");
  const [newMemory, setNewMemory] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${HISTORY_API}?session_id=${sessionId}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } finally {
      setSyncing(false);
    }
  }, [sessionId]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`${HISTORY_API}?session_id=${sessionId}&conversation_id=${convId}`);
      const data = await res.json();
      const msgs: Message[] = (data.messages || []).map((m: {id: string; role: "user"|"assistant"; content: string; image_url?: string; created_at: string}) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        imageUrl: m.image_url || undefined,
        timestamp: new Date(m.created_at).getTime(),
      }));
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  }, [sessionId]);

  const loadMemory = useCallback(async () => {
    try {
      const res = await fetch(`${MEMORY_API}?session_id=${sessionId}`);
      const data = await res.json();
      setMemory(data.memory || []);
    } catch {
      setMemory([]);
    }
  }, [sessionId]);

  useEffect(() => {
    loadConversations();
    loadMemory();
  }, [loadConversations, loadMemory]);

  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId);
    } else {
      setMessages([]);
    }
  }, [activeConvId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  const createNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    clearImage();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const selectConversation = (convId: string) => {
    setActiveConvId(convId);
    setActiveTab("chats");
  };

  const clearImage = () => {
    setImageBase64(null);
    setImagePreview(null);
    setImageMime("image/jpeg");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleImageFile = (file: File) => {
    const mime = file.type || "image/jpeg";
    setImageMime(mime);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !imageBase64) return;
    if (loading) return;

    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: text,
      imageUrl: imagePreview ?? undefined,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    const capturedImage = imageBase64;
    clearImage();
    setLoading(true);

    try {
      const bodyData: Record<string, unknown> = {
        session_id: sessionId,
        conversation_id: activeConvId || "",
        message: text,
      };
      if (capturedImage) {
        bodyData.image_base64 = capturedImage;
        bodyData.image_mime = imageMime;
      }

      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      const replyText = data.reply ?? data.error ?? "Ошибка ответа";
      const newConvId = data.conversation_id;

      if (newConvId && newConvId !== activeConvId) {
        setActiveConvId(newConvId);
      }

      const assistantMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: replyText,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      await loadConversations();
    } catch {
      const errMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: "Не удалось получить ответ. Проверьте подключение к интернету.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
  };

  const handleAddMemory = async () => {
    if (!newMemory.trim()) return;
    setAddingMemory(true);
    try {
      await fetch(MEMORY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, content: newMemory.trim() }),
      });
      setNewMemory("");
      await loadMemory();
    } finally {
      setAddingMemory(false);
    }
  };

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

  const hints = [
    "Объясни квантовые вычисления простыми словами",
    "Напиши план контент-стратегии на месяц",
    "Помоги составить письмо партнёру",
    "Проанализируй текст и выдели ключевые идеи",
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">

      {/* Sidebar */}
      <aside className={`
        flex flex-col border-r border-border transition-all duration-300 overflow-hidden flex-shrink-0
        ${sidebarOpen ? "w-64" : "w-0"}
        bg-[hsl(var(--sidebar-background))]
      `}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center glow-blue-sm">
              <span className="text-primary-foreground font-mono-xdai text-xs font-bold">X</span>
            </div>
            <span className="font-semibold text-sm tracking-wide">XDai</span>
            {syncing && <Icon name="RefreshCw" size={11} className="text-muted-foreground animate-spin" />}
          </div>
          <button
            onClick={createNewChat}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Новый чат"
          >
            <Icon name="Plus" size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("chats")}
            className={`flex-1 text-xs py-2.5 font-medium transition-colors ${activeTab === "chats" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            История
          </button>
          <button
            onClick={() => { setActiveTab("memory"); loadMemory(); }}
            className={`flex-1 text-xs py-2.5 font-medium transition-colors ${activeTab === "memory" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            Память
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          {activeTab === "chats" && (
            <>
              {conversations.length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-8 px-4 leading-relaxed">
                  Нет чатов.<br/>Начните новый разговор.
                </p>
              )}
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  className={`
                    group relative flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer mb-0.5 sidebar-item-hover
                    ${activeConvId === conv.id
                      ? "bg-muted text-foreground"
                      : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]"
                    }
                  `}
                  onClick={() => selectConversation(conv.id)}
                >
                  <Icon name="MessageCircle" size={13} className="flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate font-medium leading-none">{conv.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{getTimeLabel(conv.updated_at)}</p>
                  </div>
                </div>
              ))}
            </>
          )}

          {activeTab === "memory" && (
            <div className="space-y-1 pt-1">
              <div className="flex gap-1 px-1 mb-2">
                <input
                  value={newMemory}
                  onChange={e => setNewMemory(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddMemory()}
                  placeholder="Запомнить..."
                  className="flex-1 bg-muted rounded-lg text-xs px-3 py-2 outline-none border border-transparent focus:border-primary/40 placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleAddMemory}
                  disabled={addingMemory || !newMemory.trim()}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {addingMemory ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Plus" size={12} />}
                </button>
              </div>
              {memory.length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-6 px-4 leading-relaxed">
                  Память пуста.<br/>Добавьте что-то о себе.
                </p>
              )}
              {memory.map(item => (
                <div key={item.id} className="flex items-start gap-2 px-3 py-2 rounded-xl bg-muted/40 mx-1">
                  <Icon name="Brain" size={11} className="text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-foreground leading-relaxed">{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border space-y-1">
          <button
            onClick={loadConversations}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-2 rounded-lg hover:bg-muted w-full"
          >
            <Icon name="RefreshCw" size={13} />
            <span>Синхронизировать</span>
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-2 rounded-lg hover:bg-muted w-full"
          >
            <Icon name={theme === "dark" ? "Sun" : "Moon"} size={13} />
            <span>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <Icon name={sidebarOpen ? "PanelLeftClose" : "PanelLeft"} size={17} />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            {!sidebarOpen && (
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground font-mono-xdai text-[10px] font-bold">X</span>
              </div>
            )}
            <h1 className="text-sm font-semibold truncate">
              {activeConv ? activeConv.title : "XDai"}
            </h1>
          </div>

          <div className="flex items-center gap-1">
            {!sidebarOpen && (
              <button
                onClick={toggleTheme}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Icon name={theme === "dark" ? "Sun" : "Moon"} size={16} />
              </button>
            )}
            <button
              onClick={createNewChat}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Новый чат"
            >
              <Icon name="SquarePen" size={16} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 px-4 animate-fade-in">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-blue">
                  <span className="text-primary font-mono-xdai text-2xl font-bold">X</span>
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-semibold">Привет! Я XDai</h2>
                  <p className="text-muted-foreground text-sm mt-1">Умный ИИ-ассистент с памятью и синхронизацией</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {hints.map(hint => (
                  <button
                    key={hint}
                    onClick={() => { setInput(hint); inputRef.current?.focus(); }}
                    className="text-left text-xs px-3.5 py-3 rounded-xl border border-border bg-card hover:bg-muted hover:border-primary/40 transition-all text-muted-foreground hover:text-foreground leading-relaxed"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 message-enter ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`
                    w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5
                    ${msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground border border-border"
                    }
                  `}>
                    {msg.role === "user" ? "Вы" : "X"}
                  </div>
                  <div className={`flex-1 min-w-0 max-w-[85%] ${msg.role === "user" ? "flex flex-col items-end" : ""}`}>
                    {msg.imageUrl && (
                      <img
                        src={msg.imageUrl}
                        alt="Вложение"
                        className="max-w-[200px] rounded-xl mb-2 border border-border object-cover"
                      />
                    )}
                    <div className={`
                      rounded-2xl px-4 py-3 text-sm leading-relaxed
                      ${msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted/60 text-foreground rounded-tl-sm border border-border/50 chat-prose"
                      }
                    `}>
                      {msg.role === "assistant"
                        ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                        : <p className="whitespace-pre-wrap">{msg.content}</p>
                      }
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                      {getTimeLabel(msg.timestamp)}
                    </span>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 message-enter">
                  <div className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                    X
                  </div>
                  <div className="bg-muted/60 border border-border/50 rounded-2xl rounded-tl-sm">
                    <TypingIndicator />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-border">
          <div className="max-w-3xl mx-auto">
            {imagePreview && (
              <div className="mb-2 relative inline-block">
                <img src={imagePreview} alt="Preview" className="h-20 rounded-xl border border-border object-cover" />
                <button
                  onClick={clearImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md"
                >
                  <Icon name="X" size={10} />
                </button>
              </div>
            )}

            <div className="flex gap-2 items-end bg-muted/60 rounded-2xl border border-border px-3 py-2 focus-within:border-primary/50 focus-within:bg-muted transition-all">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
              />

              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors flex-shrink-0"
                title="Сделать фото"
              >
                <Icon name="Camera" size={16} />
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors flex-shrink-0"
                title="Прикрепить изображение"
              >
                <Icon name="Paperclip" size={16} />
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Напишите сообщение... (Enter — отправить)"
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground leading-relaxed py-1.5 max-h-[180px] overflow-y-auto"
                disabled={loading}
              />

              <button
                onClick={handleSend}
                disabled={loading || (!input.trim() && !imageBase64)}
                className={`
                  w-8 h-8 flex items-center justify-center rounded-lg transition-all flex-shrink-0
                  ${loading || (!input.trim() && !imageBase64)
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:opacity-90 glow-blue-sm"
                  }
                `}
              >
                {loading
                  ? <Icon name="Loader2" size={16} className="animate-spin" />
                  : <Icon name="ArrowUp" size={16} />
                }
              </button>
            </div>

            <p className="text-center text-[10px] text-muted-foreground mt-2 opacity-60">
              XDai может ошибаться — проверяйте важную информацию
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
