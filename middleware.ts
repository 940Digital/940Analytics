import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Reviews are behind auth too, so their session needs refreshing on the
  // same terms as the dashboard. Without this a reviewer left on the page
  // long enough would start getting 401s from the frame and asset routes.
  matcher: ["/dashboard/:path*", "/review/:path*"],
};
