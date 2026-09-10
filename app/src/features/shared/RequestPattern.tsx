import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Card } from "../../ui";

type PatternItem = { _id: string; url: string | null; caption: string | null };

// The reference photo(s) for a group order — shared by everyone with a reason to see this
// job, uploaded only by whoever is coordinating it. Used from both staffing paths: TeamDetail
// (auto-assembly) and GroupApplicants (open call), which otherwise share nothing.
export function RequestPattern({ requestId, canManage }: { requestId: string; canManage: boolean }) {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["requests/pattern", requestId, token];
  const { data: patterns } = useQuery({
    queryKey,
    queryFn: () => apiGet<PatternItem[]>("/api/requests/pattern", { token: token!, requestId }),
    enabled: !!token,
  });
  const deleteItem = useMutation({
    mutationFn: (itemId: string) => apiPost("/api/requests/pattern-delete", { token, itemId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const upload = async (file: File) => {
    const { signedUrl, path } = await apiPost<{ signedUrl: string; path: string }>(
      "/api/requests/pattern-upload-url",
      { token, requestId, fileName: file.name },
    );
    await fetch(signedUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
    const caption = window.prompt(t("captionPrompt")) ?? "";
    await apiPost("/api/requests/pattern", { token, requestId, path, caption });
    void queryClient.invalidateQueries({ queryKey });
  };

  if (!canManage && (patterns ?? []).length === 0) return null;

  return (
    <Card className="mb-2">
      <h3 className="font-semibold text-loom-indigo mb-2">{t("pattern")}</h3>
      {patterns?.length === 0 && <div className="text-sm text-loom-indigoSoft mb-2">{t("noPatternYet")}</div>}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {patterns?.map((p) => (
          <div key={p._id} className="relative aspect-square bg-loom-cotton rounded-[14px] overflow-hidden">
            {p.url && <img src={p.url} alt={p.caption ?? ""} className="w-full h-full object-cover" />}
            {canManage && (
              <button
                aria-label={t("deleteImage")}
                className="absolute top-1 right-1 bg-loom-madder text-white rounded-full w-8 h-8 text-sm leading-none"
                onClick={() => {
                  if (window.confirm(t("confirmDeleteImage"))) deleteItem.mutate(p._id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {canManage && (
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
          }}
        />
      )}
    </Card>
  );
}
