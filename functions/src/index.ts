import Anthropic from "@anthropic-ai/sdk";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { OrganizeError, OrganizeInputSchema, organizeNote } from "./organizer.js";

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

export const organize = onCall(
  {
    region: "asia-northeast3",
    invoker: "public", // required so the browser's CORS preflight reaches the function
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 180,
    memory: "512MiB",
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const parsed = OrganizeInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "invalid input");
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    try {
      return await organizeNote(client, parsed.data);
    } catch (err) {
      if (err instanceof OrganizeError) {
        throw new HttpsError("failed-precondition", err.message, { code: err.code });
      }
      if (err instanceof Anthropic.AuthenticationError) {
        logger.error("Anthropic API key rejected — check the ANTHROPIC_API_KEY secret");
        throw new HttpsError("failed-precondition", "서버의 AI API 키 설정을 확인하세요.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new HttpsError("resource-exhausted", "AI 요청이 많습니다. 잠시 후 다시 시도하세요.");
      }
      if (err instanceof Anthropic.APIError) {
        logger.error("Anthropic API error", { status: err.status, message: err.message });
        throw new HttpsError("unavailable", "AI 서비스 호출에 실패했습니다.");
      }
      logger.error("organize failed", err);
      throw new HttpsError("internal", "정리 중 오류가 발생했습니다.");
    }
  },
);
