import { supabaseAdmin } from "@/lib/supabase-server";
import { callOpenAI } from "@/lib/openai";
import type { Prompt, PromptVersion } from "@/lib/types";

/**
 * Get the active content for a prompt by slug.
 * This is the main function used by other services to fetch prompts.
 */
export async function getPrompt(slug: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("prompts")
    .select("content")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error) throw error;
  return data.content as string;
}

/**
 * Get all prompts (for admin dashboard).
 */
export async function getAllPrompts(): Promise<Prompt[]> {
  const { data, error } = await supabaseAdmin
    .from("prompts")
    .select("*")
    .order("slug");

  if (error) throw error;
  return (data ?? []) as Prompt[];
}

/**
 * Get a single prompt by ID.
 */
export async function getPromptById(id: string): Promise<Prompt | null> {
  const { data, error } = await supabaseAdmin
    .from("prompts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as Prompt;
}

/**
 * Get a single prompt by slug.
 */
export async function getPromptBySlug(slug: string): Promise<Prompt | null> {
  const { data, error } = await supabaseAdmin
    .from("prompts")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as Prompt;
}

/**
 * Update a prompt's content. Saves the old version to prompt_versions.
 */
export async function updatePrompt(
  id: string,
  content: string,
  changeNote?: string
): Promise<Prompt> {
  // Get current version
  const current = await getPromptById(id);
  if (!current) throw new Error("Prompt not found");

  // Save current version to history
  const { error: historyError } = await supabaseAdmin
    .from("prompt_versions")
    .insert({
      prompt_id: id,
      content: current.content,
      version: current.version,
      change_note: changeNote ?? null,
    });

  if (historyError) throw historyError;

  // Update prompt with new content and incremented version
  const { data, error } = await supabaseAdmin
    .from("prompts")
    .update({
      content,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Prompt;
}

/**
 * Get version history for a prompt.
 */
export async function getPromptVersions(
  promptId: string
): Promise<PromptVersion[]> {
  const { data, error } = await supabaseAdmin
    .from("prompt_versions")
    .select("*")
    .eq("prompt_id", promptId)
    .order("version", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PromptVersion[];
}

/**
 * Revert a prompt to a specific version from history.
 */
export async function revertPrompt(
  promptId: string,
  versionId: string
): Promise<Prompt> {
  // Get the version to revert to
  const { data: version, error: vErr } = await supabaseAdmin
    .from("prompt_versions")
    .select("content, version")
    .eq("id", versionId)
    .eq("prompt_id", promptId)
    .single();

  if (vErr) throw vErr;
  if (!version) throw new Error("Version not found");

  // Update using the normal flow (saves current to history)
  return updatePrompt(
    promptId,
    version.content as string,
    `Reverted to version ${version.version}`
  );
}

/**
 * Use AI to rewrite a prompt based on a natural language description.
 * Returns the new text WITHOUT saving — user must approve first.
 */
export async function aiRewritePrompt(
  promptId: string,
  description: string
): Promise<string> {
  // Get the prompt_rewriter system prompt
  const rewriterPrompt = await getPrompt("prompt_rewriter");

  // Get the current prompt content
  const current = await getPromptById(promptId);
  if (!current) throw new Error("Prompt not found");

  const userMessage = `CURRENT PROMPT (slug: ${current.slug}, name: ${current.name}):\n---\n${current.content}\n---\n\nREQUESTED CHANGES:\n${description}`;

  const result = await callOpenAI({
    system: rewriterPrompt,
    user: userMessage,
    maxTokens: 4096,
  });

  return result;
}
