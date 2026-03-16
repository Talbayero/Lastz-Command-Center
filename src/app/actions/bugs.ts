"use server";

import db from "@/utils/sqlite";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export async function submitBug(formData: { reporter?: string, description: string, priority?: string }) {
  try {
    if (!formData.description) {
      return { success: false, error: "Description is required" };
    }

    db.prepare(`
      INSERT INTO Bug (id, reporter, description, priority, status)
      VALUES (?, ?, ?, ?, 'Open')
    `).run(
      uuidv4(),
      formData.reporter || "Anonymous",
      formData.description,
      formData.priority || "Medium"
    );

    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("BUG SUBMISSION ERROR:", error);
    return { success: false, error: error.message };
  }
}

export async function updateBugStatus(id: string, status: string) {
  try {
    db.prepare(`UPDATE Bug SET status = ? WHERE id = ?`).run(status, id);
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("BUG UPDATE ERROR:", error);
    return { success: false, error: error.message };
  }
}
