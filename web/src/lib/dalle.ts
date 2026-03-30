/**
 * DALL-E 3 image generation via OpenAI API.
 * Used for scientific diagrams that need real visuals.
 * Cost: ~$0.04 per image (1024x1024, standard quality).
 */

interface DalleResponse {
  data: Array<{
    url: string;
    revised_prompt: string;
  }>;
}

export async function generateDiagramImage(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: `Educational science diagram for IGCSE students. ${prompt}. Clean, clear, well-labeled, white background, professional educational style.`,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DALL-E API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const result = (await response.json()) as DalleResponse;
  const url = result.data[0]?.url;

  if (!url) {
    throw new Error("DALL-E returned no image URL");
  }

  return url;
}
