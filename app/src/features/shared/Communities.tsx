import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, POLL_MS } from "../../lib/api";
import { supabaseRealtime } from "../../lib/realtime";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen, ListenButton } from "../../ui";
import { SignOut } from "../provider/Current";

type ThreadRow = { _id: string; title: string; lastMessage: string | null };
type MessageRow = { _id: string; body: string; senderId: string; senderRole: string; mine: boolean };

export function Communities() {
  const { token, t } = useAuth();
  const { data: threads } = useQuery({
    queryKey: ["chat/threads", token],
    queryFn: () => apiGet<ThreadRow[]>("/api/chat/threads", { token: token! }),
    enabled: !!token,
    refetchInterval: POLL_MS,
  });
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  if (openThreadId) return <ChatThread threadId={openThreadId} onBack={() => setOpenThreadId(null)} />;

  return (
    <Screen title={t("communities")} right={<SignOut />}>
      {threads === undefined && <div className="text-loom-indigoSoft">…</div>}
      {threads && threads.length === 0 && <div className="text-loom-indigoSoft">{t("noResults")}</div>}
      {threads?.map((th) => (
        <Card key={th._id} className="mb-2 cursor-pointer" >
          <button className="text-left w-full" onClick={() => setOpenThreadId(th._id)}>
            <div className="font-semibold text-loom-indigo">{th.title}</div>
            <div className="text-sm text-loom-indigoSoft truncate">{th.lastMessage ?? "—"}</div>
          </button>
        </Card>
      ))}
    </Screen>
  );
}

export function ChatThread({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const { token, t, me } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["chat/messages", threadId];
  const { data: messages } = useQuery({
    queryKey,
    queryFn: () => apiGet<MessageRow[]>("/api/chat/messages", { token: token!, threadId }),
    enabled: !!token,
  });
  const send = useMutation({
    mutationFn: (body: string) => apiPost("/api/chat/messages", { token, threadId, body }),
  });
  const [text, setText] = useState("");

  // Realtime, not polling: the ONE place a Supabase client ships to the browser (anon key,
  // public-read RLS — see supabase/schema.sql). Only ever subscribes; writes go through
  // /api/chat/messages with the service-role key.
  useEffect(() => {
    const myUserId = me?.userId;
    const channel = supabaseRealtime
      .channel(`messages:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as { id: string; body: string; sender_id: string; sender_role: string };
          const msg: MessageRow = {
            _id: row.id,
            body: row.body,
            senderId: row.sender_id,
            senderRole: row.sender_role,
            mine: row.sender_id === myUserId,
          };
          queryClient.setQueryData<MessageRow[]>(queryKey, (prev) => (prev ? [...prev, msg] : [msg]));
        },
      )
      .subscribe();
    return () => {
      supabaseRealtime.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, me?.userId]);

  const submit = async () => {
    if (!token || !text.trim()) return;
    await send.mutateAsync(text);
    setText("");
  };

  return (
    <Screen title={t("chat")} right={<button onClick={onBack} className="text-loom-indigo">‹ back</button>}>
      <div className="space-y-2 mb-4">
        {messages?.map((m) => (
          <div key={m._id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`rounded-[14px] px-3 py-2 max-w-[80%] ${m.mine ? "bg-loom-indigo text-loom-cotton" : "bg-loom-cottonDeep text-loom-ink"}`}>
              {m.body} {!m.mine && <ListenButton text={m.body} />}
            </div>
          </div>
        ))}
      </div>
      <div className="fixed bottom-0 left-0 right-0 max-w-[520px] mx-auto p-2 bg-loom-cotton border-t border-loom-cottonDeep flex gap-2">
        <div className="flex-1">
          <Field className="mb-0" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("typeMessage")} />
        </div>
        <Button variant="gold" onClick={submit}>{t("send")}</Button>
      </div>
    </Screen>
  );
}
