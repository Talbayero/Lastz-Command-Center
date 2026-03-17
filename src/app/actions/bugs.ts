"use server";

import prisma from "@/utils/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/utils/auth";

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

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("BUG SUBMISSION ERROR:", error);
    return { success: false, error: error.message };
  }
}

export async function updateBugStatus(id: string, status: string) {
  try {
    await requirePermission("manageBugs");

    await prisma.bug.update({
      where: { id },
      data: { status },
    });
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("BUG UPDATE ERROR:", error);
    return { success: false, error: error.message };
  }
}
