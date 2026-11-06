import { describe, expect, it } from "vitest";
import { readFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/limited-form-data";

describe("multipart upload size limits", () => {
  it("parses an upload below the byte limit", async () => {
    const form = new FormData(); form.append("image", new File(["stone"], "stone.jpg", { type: "image/jpeg" }));
    const request = new Request("https://local.test/api/analyze", { method: "POST", body: form });
    const parsed = await readFormDataWithinLimit(request, 2048);
    expect((parsed.get("image") as File).name).toBe("stone.jpg");
  });

  it("rejects an oversized streamed request before parsing its body", async () => {
    const body = new Uint8Array(2049);
    const request = new Request("https://local.test/api/analyze", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body });
    await expect(readFormDataWithinLimit(request, 2048)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
