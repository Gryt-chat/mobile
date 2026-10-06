import { describe, expect, it } from "vitest";

import { mayUploadBanner } from "./bannerUpload";

describe("who may set a banner (desktop's rule)", () => {
  it("says no when the server sent no permissions at all", () => {
    expect(mayUploadBanner(undefined)).toBe(false);
    expect(mayUploadBanner({} as never)).toBe(false);
  });

  it("says yes with the banner permission", () => {
    expect(mayUploadBanner({ permissions: ["upload_banner_image"] } as never)).toBe(true);
  });

  it("falls back to the avatar permission only on a server that has no banner permission yet", () => {
    expect(mayUploadBanner({ permissions: ["upload_avatar_image"], permission_catalogue: [] } as never)).toBe(true);
    expect(
      mayUploadBanner({ permissions: ["upload_avatar_image"], permission_catalogue: ["upload_banner_image"] } as never),
    ).toBe(false);
  });

  it("says no to somebody who may upload neither", () => {
    expect(mayUploadBanner({ permissions: ["send_messages"], permission_catalogue: ["upload_banner_image"] } as never)).toBe(false);
  });
});
