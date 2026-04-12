"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const MAX_SIZE_MB = 2;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Props = {
  userId: string;
  currentAvatarUrl: string | null;
  fullName: string | null;
};

export function AvatarUpload({ userId, currentAvatarUrl, fullName }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const initials = fullName
    ? fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Formato non supportato. Usa JPG, PNG, WebP o GIF.");
      return;
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Il file è troppo grande. Massimo ${MAX_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);
    const toastId = toast.loading("Caricamento avatar...");

    try {
      const ext = file.name.split(".").pop();
      const filePath = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Add cache-busting so the browser reloads the new image
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", userId);

      if (profileError) throw profileError;

      setAvatarUrl(publicUrl);
      toast.success("Avatar aggiornato!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Errore durante il caricamento. Riprova.", { id: toastId });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setUploading(true);
    const toastId = toast.loading("Rimozione avatar...");

    try {
      const { data: files } = await supabase.storage
        .from("avatars")
        .list(userId);

      if (files && files.length > 0) {
        await supabase.storage
          .from("avatars")
          .remove(files.map((f) => `${userId}/${f.name}`));
      }

      await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);

      setAvatarUrl(null);
      toast.success("Avatar rimosso.", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Errore durante la rimozione. Riprova.", { id: toastId });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Avatar</label>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          disabled={uploading}
          className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors cursor-pointer flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          title="Clicca per cambiare avatar"
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt="Avatar"
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center text-xl font-semibold text-muted-foreground">
              {initials}
            </div>
          )}

          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
        </button>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            {uploading ? "Caricamento..." : "Cambia foto"}
          </button>

          {avatarUrl && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-sm text-destructive hover:underline text-left"
            >
              Rimuovi
            </button>
          )}

          <p className="text-xs text-muted-foreground">
            JPG, PNG, WebP o GIF · max {MAX_SIZE_MB}MB
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
