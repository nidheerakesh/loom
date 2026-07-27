import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen, ListenButton } from "../../ui";
import { SignOut } from "../provider/Current";

export function Communities() {
  const { token, t } = useAuth();
  const threads = useQuery(api.chat.listThreads, token ? { token } : "skip");
  const [openThreadId, setOpenThreadId] = useState<Id<"chatThreads"> | null>(null);

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

export function ChatThread({ threadId, onBack }: { threadId: Id<"chatThreads">; onBack: () => void }) {
  const { token, t } = useAuth();
  const messages = useQuery(api.chat.listMessages, token ? { token, threadId } : "skip");
  const send = useMutation(api.chat.send);
  const [text, setText] = useState("");

  const submit = async () => {
    if (!token || !text.trim()) return;
    await send({ token, threadId, body: text });
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
          <Field className="mb-0" value={text} onChange={(e) => setText(e.target.value)} placeholder="🎤 …" />
        </div>
        <Button variant="gold" onClick={submit}>{t("send")}</Button>
      </div>
    </Screen>
  );
}
