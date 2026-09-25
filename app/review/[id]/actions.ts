"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Every write here goes through the caller's own session, so row level
 * security is the authority on who may do what. The checks in this file are
 * about giving a useful message, not about holding the gate.
 */

async function me() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Taken off the session rather than looked up, because accounts is
     select-own-or-master: a client reading Owen's row gets nothing back. */
  const name =
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Someone";

  return { supabase, user, name };
}

export async function addThread(formData: FormData) {
  const { supabase, user, name } = await me();
  if (!user) return { error: "Please sign in again." };

  const reviewId = String(formData.get("reviewId") || "");
  const pageId = String(formData.get("pageId") || "");
  const anchor = String(formData.get("anchor") || "");
  const body = String(formData.get("body") || "").trim();
  const original = String(formData.get("originalText") || "");
  const suggestedRaw = String(formData.get("suggestedText") || "").trim();

  if (!pageId || !anchor) return { error: "Pick something on the page first." };

  /* A note with neither words nor a rewrite is not feedback */
  const suggested = suggestedRaw && suggestedRaw !== original.trim() ? suggestedRaw : null;
  if (!body && !suggested) {
    return { error: "Add a note, or change the wording, before sending." };
  }

  const { data: thread, error } = await supabase
    .from("rv_threads")
    .insert({
      page_id: pageId,
      anchor,
      anchor_label: String(formData.get("anchorLabel") || "").slice(0, 200),
      original_text: original || null,
      suggested_text: suggested,
      created_by: user.id,
      author_name: name,
    })
    .select("id")
    .single();

  if (error || !thread) return { error: error?.message || "Could not save that." };

  if (body) {
    await supabase.from("rv_messages").insert({
      thread_id: thread.id,
      body,
      created_by: user.id,
      author_name: name,
    });
  }

  revalidatePath(`/review/${reviewId}`);
  return { ok: true, id: thread.id };
}

export async function addMessage(formData: FormData) {
  const { supabase, user, name } = await me();
  if (!user) return { error: "Please sign in again." };

  const body = String(formData.get("body") || "").trim();
  const threadId = String(formData.get("threadId") || "");
  const reviewId = String(formData.get("reviewId") || "");
  if (!body) return { error: "Nothing to send." };

  const { error } = await supabase
    .from("rv_messages")
    .insert({ thread_id: threadId, body, created_by: user.id, author_name: name });

  if (error) return { error: error.message };
  revalidatePath(`/review/${reviewId}`);
  return { ok: true };
}

export async function setThreadStatus(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };

  const threadId = String(formData.get("threadId") || "");
  const reviewId = String(formData.get("reviewId") || "");
  const status = String(formData.get("status") || "");

  if (!["open", "accepted", "declined", "resolved"].includes(status)) {
    return { error: "Unknown status." };
  }

  const { error } = await supabase
    .from("rv_threads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", threadId);

  /* Only the master account has an update policy for someone else's thread,
     so a client clicking this gets a quiet no-op rather than a change. */
  if (error) return { error: error.message };
  revalidatePath(`/review/${reviewId}`);
  return { ok: true };
}

export async function updateThreadSuggestion(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };

  const threadId = String(formData.get("threadId") || "");
  const reviewId = String(formData.get("reviewId") || "");
  const suggested = String(formData.get("suggestedText") || "").trim();

  const { error } = await supabase
    .from("rv_threads")
    .update({ suggested_text: suggested || null, updated_at: new Date().toISOString() })
    .eq("id", threadId);

  if (error) return { error: error.message };
  revalidatePath(`/review/${reviewId}`);
  return { ok: true };
}

/**
 * Removes a note and everything said under it. The row level security policy
 * allows the author or the agency account and nobody else, so a client can
 * take back their own note but never somebody else's.
 */
export async function deleteThread(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };

  const threadId = String(formData.get("threadId") || "");
  const reviewId = String(formData.get("reviewId") || "");

  const { error } = await supabase.from("rv_threads").delete().eq("id", threadId);
  if (error) return { error: error.message };

  revalidatePath(`/review/${reviewId}`);
  return { ok: true };
}

/** Removes one reply, leaving the note and the rest of the thread alone. */
export async function deleteMessage(formData: FormData) {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };

  const messageId = String(formData.get("messageId") || "");
  const reviewId = String(formData.get("reviewId") || "");

  const { error } = await supabase.from("rv_messages").delete().eq("id", messageId);
  if (error) return { error: error.message };

  revalidatePath(`/review/${reviewId}`);
  return { ok: true };
}
