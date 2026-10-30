// Pages authorize themselves. A layout check alone is not enough (spec §3, §13).
import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type ServerUser } from "./session";

export async function requireStaffPage(path: string): Promise<ServerUser> {
    const user = await getSessionUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
    if (user.role === "CUSTOMER") redirect("/account");
    return user;
}