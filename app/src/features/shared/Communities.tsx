import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, POLL_MS } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen, ListenButton, TextButton } from "../../ui";
import { SignOut } from "../provider/Current";

type ThreadRow = { _id: string; title: string; lastMessage: string | null };
type MessageRow = {
  _id: string;
  body: string;
  senderId: string;
  senderRole: string;
  senderName: string | null;
  mine: boolean;
  attachmentUrl: string | null;
};

type ProviderOption = { _id: string; name: string; shopName: string | null };

export function Communities() {
  const { token, t, me } = useAuth();
  const { data: threads } = useQuery({
    queryKey: ["chat/threads", token],
    queryFn: () => apiGet<ThreadRow[]>("/api/chat/threads", { token: token! }),
    enabled: !!token,
    refetchInterval: POLL_MS,
  });
  const [openThread, setOpenThread] = useState<{ id: string; title?: string } | null>(null);
  const [composing, setComposing] = useState(false);

  if (openThread)
    return (
      <ChatThread threadId={openThread.id} title={openThread.title} onBack={() => setOpenThread(null)} />
    );
  if (composing)
    return (
      <NewConversation
        onBack={() => setComposing(false)}
        onCreated={(id) => {
          setComposing(false);
          setOpenThread({ id });
        }}
      />
    );

  return (
    <Screen title={t("communities")} right={<SignOut />}>
      {/* Only customers start conversations: a provider messaging arbitrary customers
          unprompted is a different product with different consent questions. */}
      {me?.role === "customer" && (
        <Button variant="gold" className="w-full mb-3" onClick={() => setComposing(true)}>
          {t("newConversation")}
        </Button>
      )}
      {threads === undefined && <div className="text-loom-indigoSoft">…</div>}
      {threads && threads.length === 0 && <div className="text-loom-indigoSoft">{t("noResults")}</div>}
      {threads?.map((th) => (
        <Card key={th._id} className="mb-2 cursor-pointer" >
          <button className="text-left w-full" onClick={() => setOpenThread({ id: th._id, title: th.title })}>
            <div className="font-semibold text-loom-indigo">{th.title}</div>
            <div className="text-sm text-loom-indigoSoft truncate">{th.lastMessage ?? "—"}</div>
          </button>
        </Card>
      ))}
    </Screen>
  );
}

// `title` is who the conversation is with, resolved per viewer by /api/chat/threads. Passed in
// rather than fetched: the caller already has it, and a chat headed only "Chat" leaves you
// unable to tell which conversation you opened.
export function ChatThread({
  threadId,
  title,
  onBack,
}: {
  threadId: string;
  title?: string;
  onBack: () => void;
}) {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["chat/messages", threadId];
  const { data: messages } = useQuery({
    queryKey,
    queryFn: () => apiGet<MessageRow[]>("/api/chat/messages", { token: token!, threadId }),
    enabled: !!token,
    // Polled rather than pushed. Live updates used to come from a browser-side Supabase
    // client, which needed a public-read RLS policy on `messages` — and that policy let
    // anyone holding the anon key (it ships in the JS bundle) read every conversation in
    // the app. Privacy beats latency here: reads now go through /api/chat/messages, which
    // can check who is asking.
    refetchInterval: POLL_MS,
  });
  const send = useMutation({
    mutationFn: (payload: { body: string; attachmentPath?: string }) =>
      apiPost("/api/chat/messages", { token, threadId, ...payload }),
  });
  const [text, setText] = useState("");
  const [sendingPhoto, setSendingPhoto] = useState(false);

  const submit = async () => {
    if (!token || !text.trim()) return;
    await send.mutateAsync({ body: text });
    setText("");
  };

  // Open to any participant, not just the coordinator — she has the separate pattern-photo
  // feature for the one reference image; this is ordinary conversation, which is nobody's
  // job to gatekeep.
  const sendPhoto = async (file: File) => {
    if (!token) return;
    setSendingPhoto(true);
    try {
      const { signedUrl, path } = await apiPost<{ signedUrl: string; path: string }>(
        "/api/chat/attachment-upload-url",
        { token, threadId, fileName: file.name },
      );
      await fetch(signedUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      await send.mutateAsync({ body: "", attachmentPath: path });
      void queryClient.invalidateQueries({ queryKey });
    } finally {
      setSendingPhoto(false);
    }
  };

  return (
    <Screen title={title || t("chat")} right={<TextButton onClick={onBack}>‹ {t("back")}</TextButton>}>
      <div className="space-y-2 mb-4">
        {messages?.map((m) => (
          <div key={m._id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`rounded-[14px] px-3 py-2 max-w-[80%] ${m.mine ? "bg-loom-indigo text-loom-cotton" : "bg-loom-cottonDeep text-loom-ink"}`}>
              {!m.mine && m.senderName && (
                <div className="text-xs font-semibold text-loom-leaf mb-0.5">{m.senderName}</div>
              )}
              {m.attachmentUrl && (
                <img
                  src={m.attachmentUrl}
                  alt=""
                  className="rounded-[10px] max-w-full max-h-[240px] object-cover mb-1"
                />
              )}
              {m.body} {!m.mine && m.body && <ListenButton text={m.body} />}
            </div>
          </div>
        ))}
      </div>
      {/* Sat at `bottom-0`, the same as the tab bar, so it rendered underneath it and the
          message box could not be reached. The tab bar is 56px plus safe-area inset; this
          clears it and matches the pb-24 the Screen already reserves. */}
      <div className="fixed bottom-[72px] left-0 right-0 max-w-[520px] mx-auto p-2 bg-loom-cotton border-t border-loom-line flex gap-2 z-20 items-center">
        <label className="text-2xl leading-none cursor-pointer px-1" aria-label={t("attachPhoto")}>
          📷
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={sendingPhoto}
            onChange={(e) => {
              if (e.target.files?.[0]) void sendPhoto(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="flex-1">
          <Field className="mb-0" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("typeMessage")} />
        </div>
        <Button variant="gold" onClick={() => void submit()}>{t("send")}</Button>
      </div>
    </Screen>
  );
}

// Pick one provider for a one-to-one chat, or several for a group. One provider reuses the
// existing thread for that pair rather than starting a parallel conversation.
function NewConversation({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (threadId: string) => void;
}) {
  const { token, t } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");

  const { data: providers } = useQuery({
    queryKey: ["providers/search", token, "chat-picker"],
    queryFn: () => apiGet<ProviderOption[]>("/api/providers/search", { token: token! }),
    enabled: !!token,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<string>("/api/chat/create", { token, providerIds: selected, title: title.trim() }),
    onSuccess: (threadId) => onCreated(threadId),
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Screen
      title={t("newConversation")}
      right={
        <TextButton onClick={onBack}>‹ {t("back")}</TextButton>
      }
    >
      <Field
        label={t("conversationName")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("conversationNamePlaceholder")}
      />

      <div className="text-sm text-loom-indigoSoft mb-1">
        {selected.length > 0 ? `${selected.length} ${t("selected")}` : t("choosePeople")}
      </div>

      {providers === undefined && <div className="text-loom-indigoSoft">…</div>}
      {providers?.map((p) => (
        <Card key={p._id} className="mb-2">
          <button
            className="text-left w-full flex items-center justify-between"
            onClick={() => toggle(p._id)}
          >
            <span className="text-loom-indigo">{p.shopName ?? p.name}</span>
            <span className={selected.includes(p._id) ? "text-loom-leaf" : "text-loom-cottonDeep"}>
              ✓
            </span>
          </button>
        </Card>
      ))}

      <div className="fixed bottom-[72px] left-0 right-0 max-w-[520px] mx-auto p-2 bg-loom-cotton border-t border-loom-line z-20">
        <Button
          className="w-full"
          disabled={selected.length === 0 || !title.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {t("startConversation")}
        </Button>
        {create.isError && (
          <div className="mt-2 text-loom-madder text-sm">{(create.error).message}</div>
        )}
      </div>
    </Screen>
  );
}
