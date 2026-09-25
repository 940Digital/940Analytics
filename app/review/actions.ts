"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Master-side plumbing: hand out an invite, point a review at the CRM record
 * for that website, open or close it. Every one of these is master-only at
 * the policy level, so a client calling them gets nothing done.
 */

export async function createInvite(formData: FormData) {
  const supabase = createClient();
  const reviewId = String(formData.get("reviewId") || "");
  const email = String(formData.get("email") || "").trim() || null;

  const token = randomBytes(24).toString("base64url");

  const { error } = await supabase
    .from("rv_invites")
    .insert({ token, review_id: reviewId, email });

  if (error) return { error: error.message };
  revalidatePath("/review");
  return { ok: true, token };
}

export async function revokeInvite(formData: FormData) {
  const supabase = createClient();
  const { error } = await supabase
    .from("rv_invites")
    .update({ revoked: true })
    .eq("token", String(formData.get("token") || ""));
  if (error) return { error: error.message };
  revalidatePath("/review");
  return { ok: true };
}

export async function linkWebsite(formData: FormData) {
  const supabase = createClient();
  const reviewId = String(formData.get("reviewId") || "");
  const websiteId = String(formData.get("websiteId") || "") || null;

  const { error } = await supabase
    .from("rv_reviews")
    .update({ website_id: websiteId, updated_at: new Date().toISOString() })
    .eq("id", reviewId);

  if (error) return { error: error.message };
  revalidatePath("/review");
  return { ok: true };
}

export async function setReviewStatus(formData: FormData) {
  const supabase = createClient();
  const { error } = await supabase
    .from("rv_reviews")
    .update({
      status: String(formData.get("status") || "open"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(formData.get("reviewId") || ""));
  if (error) return { error: error.message };
  revalidatePath("/review");
  return { ok: true };
}
