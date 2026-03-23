"use server";

import prisma from "@/utils/db";
import { requirePermission } from "@/utils/auth";
import { invalidateBugDataCache } from "@/utils/cacheTags";
import {
  BUG_PRIORITIES,
  BUG_STATUSES,
  ensureAllowedValue,
  ensureRecordId,
  sanitizeMultiLineText,
  sanitizeSingleLineText,
} from "@/utils/validation";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function submitBug(formData: { reporter?: string, description: string, priority?: string }) {
  try {
    await requirePermission("manageBugs");

    const description = sanitizeMultiLineText(formData.description, 2000);
    if (!description) {
      return { success: false, error: "Description is required" };
    }

    await prisma.bug.create({
      data: {
        reporter: sanitizeSingleLineText(formData.reporter || "Anonymous", 80) || "Anonymous",
        description,
        priority: ensureAllowedValue(formData.priority || "Medium", BUG_PRIORITIES, "Medium"),
        status: "Open",
      },
    });

    invalidateBugDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("BUG SUBMISSION ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to submit bug.") };
  }
}

export async function updateBugStatus(id: string, status: string) {
  try {
    await requirePermission("manageBugs");

    await prisma.bug.update({
      where: { id: ensureRecordId(id, "Bug") },
      data: { status: ensureAllowedValue(status, BUG_STATUSES, "Open") },
    });
    invalidateBugDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("BUG UPDATE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to update bug.") };
  }
}
