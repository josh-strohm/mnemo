import { listDeleted } from "@/lib/memories";

export async function GET() {
  const items = await listDeleted();
  return Response.json(items);
}