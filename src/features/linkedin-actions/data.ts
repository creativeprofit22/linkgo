import { assertApprovalCanPublishViaLinkedIn } from "@/features/approvals/data";
import { assertCommentCanPublishViaLinkedIn } from "@/features/comments/data";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { IS_TEST, IS_TAURI } from "@/lib/env";
import {
  invokeCommand as invokeNativeCommand,
  toNativeCommandError,
} from "@/lib/tauri";
import {
  executionOutcomeSchema,
  linkedInPublishCommentInputSchema,
  linkedInPublishPostInputSchema,
} from "@/features/linkedin-actions/schemas";
import type {
  ExecutionOutcome,
  LinkedInPublishCommentInput,
  LinkedInPublishPostInput,
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

function fakePublishPostOutcome(
  input: LinkedInPublishPostInput,
): ExecutionOutcome {
  const platformId = `urn:li:ugcPost:test-${input.approvalId}`;
  return {
    status: "succeeded",
    executionId: input.approvalId,
    platformId,
    externalUrl: `https://www.linkedin.com/feed/update/${platformId}/`,
  };
}

function fakePublishCommentOutcome(
  input: LinkedInPublishCommentInput,
): ExecutionOutcome {
  const platformCommentId = `test-comment-${input.commentThreadId}`;
  return {
    status: "succeeded",
    executionId: input.commentThreadId,
    platformId: `urn:li:comment:(${input.targetUrn},${platformCommentId})`,
    externalUrl: `https://www.linkedin.com/feed/update/${input.targetUrn}/`,
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
): Promise<ExecutionOutcome> {
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
  if (result === null && IS_TEST) return fakePublishPostOutcome(parsed);
  return executionOutcomeSchema.parse(result);
}

export async function publishLinkedInComment(
  input: LinkedInPublishCommentInput,
  options: PublishLinkedInCommentOptions = {},
): Promise<ExecutionOutcome> {
  const parsed = linkedInPublishCommentInputSchema.parse(input);
  if (options.skipPreflight !== true) {
    await assertCommentCanPublishViaLinkedIn(parsed);
  }
  await assertCurrentLinkedInPublishSafety();
  const result = await invokeCommand("linkgo_linkedin_publish_comment", {
    input: parsed,
  });
  if (result === null && IS_TEST) return fakePublishCommentOutcome(parsed);
  return executionOutcomeSchema.parse(result);
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
