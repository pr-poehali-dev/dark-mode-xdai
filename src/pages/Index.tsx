import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const CHAT_API = "https://functions.poehali.dev/c396e99d-48c0-46cd-b65e-32b13a42d25c";
const STORAGE_KEY = "xdai-chats";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  timestamp: number;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
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

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChats(chats: Chat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function getTimeLabel(ts: number) {
  const d = new Date(ts);
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
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const all = loadChats();
    return all.length > 0 ? all[0].id : null;
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId) ?? null;

  useEffect(() => { saveChats(chats); }, [chats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length, loading]);

  const createNewChat = useCallback(() => {
    const newChat: Chat = {
      id: generateId(),
      title: "Новый чат",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInput("");
    clearImage();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const deleteChat = (chatId: string) => {
    setChats(prev => {
      const remaining = prev.filter(c => c.id !== chatId);
      if (activeChatId === chatId) {
        setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
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

    let chatId = activeChatId;
    let currentChats = chats;

    if (!chatId) {
      const newChat: Chat = {
        id: generateId(),
        title: text.slice(0, 40) || "Фото",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      currentChats = [newChat, ...chats];
      setChats(currentChats);
      chatId = newChat.id;
      setActiveChatId(chatId);
    }

    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: text,
      imageUrl: imagePreview ?? undefined,
      timestamp: Date.now(),
    };

    const updatedChats = currentChats.map(c => {
      if (c.id !== chatId) return c;
      const newMessages = [...c.messages, userMsg];
      const title = c.title === "Новый чат" && text ? text.slice(0, 45) : c.title;
      return { ...c, messages: newMessages, title, updatedAt: Date.now() };
    });

    setChats(updatedChats);
    setInput("");
    const capturedImage = imageBase64;
    const capturedMime = imageMime;
    clearImage();
    setLoading(true);

    const chat = updatedChats.find(c => c.id === chatId)!;
    const apiMessages = chat.messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const bodyData: Record<string, unknown> = { messages: apiMessages };
      if (capturedImage) {
        bodyData.image_base64 = capturedImage;
        bodyData.image_mime = capturedMime;
      }

      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      const replyText = data.reply ?? data.error ?? "Ошибка ответа";

      const assistantMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: replyText,
        timestamp: Date.now(),
      };

      setChats(prev => prev.map(c =>
        c.id !== chatId ? c : { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() }
      ));
    } catch {
      const errMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: "Не удалось получить ответ. Проверьте подключение к интернету.",
        timestamp: Date.now(),
      };
      setChats(prev => prev.map(c =>
        c.id !== chatId ? c : { ...c, messages: [...c.messages, errMsg], updatedAt: Date.now() }
      ));
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

  const startEditTitle = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveEditTitle = () => {
    if (!editingChatId) return;
    setChats(prev => prev.map(c =>
      c.id === editingChatId ? { ...c, title: editingTitle || c.title } : c
    ));
    setEditingChatId(null);
  };

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
          </div>
          <button
            onClick={createNewChat}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Новый чат"
          >
            <Icon name="Plus" size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          {chats.length === 0 && (
            <p className="text-center text-muted-foreground text-xs py-8 px-4 leading-relaxed">
              Нет чатов.<br/>Начните новый разговор.
            </p>
          )}
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`
                group relative flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer mb-0.5 sidebar-item-hover
                ${activeChatId === chat.id
                  ? "bg-muted text-foreground"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]"
                }
              `}
              onClick={() => setActiveChatId(chat.id)}
            >
              <Icon name="MessageCircle" size={13} className="flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                {editingChatId === chat.id ? (
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={e => setEditingTitle(e.target.value)}
                    onBlur={saveEditTitle}
                    onKeyDown={e => e.key === "Enter" && saveEditTitle()}
                    className="w-full bg-transparent text-xs outline-none border-b border-primary"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <p className="text-xs truncate font-medium leading-none">{chat.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{getTimeLabel(chat.updatedAt)}</p>
                  </>
                )}
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => startEditTitle(chat, e)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:text-primary transition-colors"
                >
                  <Icon name="Pencil" size={9} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}
                  className="w-5 h-5 flex items-center justify-center rounded hover:text-destructive transition-colors"
                >
                  <Icon name="Trash2" size={9} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border">
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
              {activeChat ? activeChat.title : "XDai"}
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
          {!activeChat || activeChat.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 px-4 animate-fade-in">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-blue">
                  <span className="text-primary font-mono-xdai text-2xl font-bold">X</span>
                </div>
                <div className="text-center">
                  <h2 className="text-xl font-semibold">Привет! Я XDai</h2>
                  <p className="text-muted-foreground text-sm mt-1">Умный ИИ-ассистент с памятью чата</p>
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
              {activeChat.messages.map((msg) => (
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
                        className="max-w-[200px] rounded-xl mb-2 border border-border"
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
