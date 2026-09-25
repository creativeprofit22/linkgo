import { assertApprovalCanPublishViaLinkedIn } from "@/features/approvals/data";
import { assertCommentCanPublishViaLinkedIn } from "@/features/comments/data";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { IS_TEST, IS_TAURI } from "@/lib/env";
import {
  invokeCommand as invokeNativeCommand,
  toNativeCommandError,
} from "@/lib/tauri";
import {
  linkedInPublishCommentInputSchema,
  linkedInPublishCommentResultSchema,
  linkedInPublishPostInputSchema,
  linkedInPublishPostResultSchema,
} from "@/features/linkedin-actions/schemas";
import type {
  LinkedInPublishCommentInput,
  LinkedInPublishCommentResult,
  LinkedInPublishPostInput,
  LinkedInPublishPostResult,
} from "@/features/linkedin-actions/types";
import { getSafetySettings } from "@/features/safety/data";

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

interface PublishLinkedInCommentOptions {
  skipPreflight?: boolean;
}

interface TauriWindowLike {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

function isInvoke(candidate: unknown): candidate is InvokeFn {
  return typeof candidate === "function";
}

function getInjectedInvoke(): InvokeFn | null {
  if (!IS_TEST || typeof window === "undefined") return null;
  const tauriWindow = window as unknown as TauriWindowLike;
  const candidate =
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke;
  return isInvoke(candidate) ? candidate : null;
}

async function invokeCommand(cmd: string, args?: unknown): Promise<unknown> {
  const injected = getInjectedInvoke();
  if (injected) {
    try {
      return await injected(cmd, args);
    } catch (error: unknown) {
      throw toNativeCommandError(error);
    }
  }
  if (IS_TEST) return null;
  if (!IS_TAURI) throw new Error("LinkedIn publishing requires the Tauri app");
  return invokeNativeCommand(cmd, args as InvokeArgs | undefined);
}

function fakePublishPostResult(
  input: LinkedInPublishPostInput,
): LinkedInPublishPostResult {
  const platformPostId = `urn:li:ugcPost:test-${input.approvalId}`;
  return {
    platformPostId,
    externalPostUrl: `https://www.linkedin.com/feed/update/${platformPostId}/`,
  };
}

function fakePublishCommentResult(
  input: LinkedInPublishCommentInput,
): LinkedInPublishCommentResult {
  const platformCommentId = `test-comment-${input.commentThreadId}`;
  const platformCommentUrn = `urn:li:comment:(${input.targetUrn},${platformCommentId})`;
  return {
    platformCommentId,
    platformCommentUrn,
    externalCommentUrl: `https://www.linkedin.com/feed/update/${input.targetUrn}/`,
  };
}

async function assertCurrentLinkedInPublishSafety(): Promise<void> {
  const settings = await getSafetySettings();
  if (settings.global_kill_switch !== 1) return;

  throw new Error(
    settings.kill_switch_reason
      ? `Global kill switch is enabled: ${settings.kill_switch_reason}`
      : "Global kill switch is enabled",
  );
}

export async function publishLinkedInPost(
  input: LinkedInPublishPostInput,
): Promise<LinkedInPublishPostResult> {
  const parsed = linkedInPublishPostInputSchema.parse(input);
  await assertApprovalCanPublishViaLinkedIn({
    approvalId: parsed.approvalId,
    ...(parsed.scheduleJobId === undefined
      ? {}
      : { scheduleJobId: parsed.scheduleJobId }),
  });
  await assertCurrentLinkedInPublishSafety();
  const result = await invokeCommand("linkgo_linkedin_publish_post", {
    input: parsed,
  });
  if (result === null && IS_TEST) return fakePublishPostResult(parsed);
  return linkedInPublishPostResultSchema.parse(result);
}

export async function publishLinkedInComment(
  input: LinkedInPublishCommentInput,
  options: PublishLinkedInCommentOptions = {},
): Promise<LinkedInPublishCommentResult> {
  const parsed = linkedInPublishCommentInputSchema.parse(input);
  if (options.skipPreflight !== true) {
    await assertCommentCanPublishViaLinkedIn(parsed);
  }
  await assertCurrentLinkedInPublishSafety();
  const result = await invokeCommand("linkgo_linkedin_publish_comment", {
    input: parsed,
  });
  if (result === null && IS_TEST) return fakePublishCommentResult(parsed);
  return linkedInPublishCommentResultSchema.parse(result);
}

if (IS_TEST && typeof window !== "undefined") {
  (
    window as unknown as {
      __LINKGO_LINKEDIN_ACTIONS_TEST_API__?: {
        publishLinkedInPost: typeof publishLinkedInPost;
        publishLinkedInComment: typeof publishLinkedInComment;
      };
    }
  ).__LINKGO_LINKEDIN_ACTIONS_TEST_API__ = {
    publishLinkedInPost,
    publishLinkedInComment,
  };
}
