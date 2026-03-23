"use server";

import prisma from "@/utils/db";
import { requirePermission } from "@/utils/auth";
import { invalidateBugDataCache } from "@/utils/cacheTags";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function submitBug(formData: { reporter?: string, description: string, priority?: string }) {
  try {
    await requirePermission("manageBugs");

    if (!formData.description) {
      return { success: false, error: "Description is required" };
    }

    await prisma.bug.create({
      data: {
        reporter: formData.reporter || "Anonymous",
        description: formData.description,
        priority: formData.priority || "Medium",
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
      where: { id },
      data: { status },
    });
    invalidateBugDataCache();
    return { success: true };
  } catch (error: unknown) {
    console.error("BUG UPDATE ERROR:", error);
    return { success: false, error: getErrorMessage(error, "Failed to update bug.") };
  }
}
