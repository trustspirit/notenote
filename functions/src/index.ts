import Anthropic from "@anthropic-ai/sdk";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineInt, defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { OrganizeError, OrganizeInputSchema, organizeNote } from "./organizer.js";
import { consumeDailyQuota, refundDailyQuota, isAllowed } from "./quota.js";

initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
// Comma-separated emails allowed to use AI. Empty = every signed-in user.
const AI_ALLOWED_EMAILS = defineString("AI_ALLOWED_EMAILS", { default: "" });
// Max AI organize calls per user per UTC day.
const AI_DAILY_LIMIT = defineInt("AI_DAILY_LIMIT", { default: 30 });

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
    // Only trust a verified email for the allowlist (e.g. an unverified email/password signup can't claim it).
    const verifiedEmail = request.auth.token.email_verified ? request.auth.token.email : undefined;
    if (!isAllowed(verifiedEmail, AI_ALLOWED_EMAILS.value())) {
      throw new HttpsError("permission-denied", "AI 정리 사용 권한이 없는 계정입니다.");
    }

    const parsed = OrganizeInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "invalid input");
    }

    // Count the call only after the input is valid, so bad requests don't burn quota.
    const quota = await consumeDailyQuota(getFirestore(), request.auth.uid, AI_DAILY_LIMIT.value());
    if (!quota.allowed) {
      throw new HttpsError("resource-exhausted", `오늘 AI 정리 한도(${AI_DAILY_LIMIT.value()}회)를 모두 사용했습니다.`);
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    try {
      return await organizeNote(client, parsed.data);
    } catch (err) {
      // No answer was produced, so the call shouldn't count against today's limit.
      if (err instanceof Anthropic.APIError) {
        await refundDailyQuota(getFirestore(), request.auth.uid).catch((e) => logger.warn("quota refund failed", e));
      }
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

// Public read-only mirror of shared notes/notebooks (clients can't write it).
export { syncNoteMirror, syncNotebookMirror } from "./mirrorTriggers.js";
