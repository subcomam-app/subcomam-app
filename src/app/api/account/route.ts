import { apiError, json, requireAccount } from "@/lib/server";

export async function GET() {
  try {
    const { user } = await requireAccount({ allowInitialPassword: true });
    return json({
      user: {
        id: user.id,
        email: user.email,
        role: user.app_metadata.role,
        name: user.user_metadata.full_name || user.email,
        officer_code: user.app_metadata.officer_code || null,
        officer_grade: user.app_metadata.officer_grade || "",
        must_change_password: !!user.app_metadata.must_change_password,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
