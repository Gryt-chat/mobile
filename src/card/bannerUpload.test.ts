import { describe, expect, it } from "vitest";

import { mayUploadBanner, mayUploadVideoBanner } from "./bannerUpload";

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

  it("takes a video banner only where the server also converts videos", () => {
    const may = { permissions: ["upload_banner_image"] };
    expect(mayUploadVideoBanner({ ...may, video_profiles: true } as never)).toBe(true);
    expect(mayUploadVideoBanner({ ...may, video_profiles: false } as never)).toBe(false);
    expect(mayUploadVideoBanner({ ...may } as never)).toBe(false);
    expect(mayUploadVideoBanner({ permissions: [], video_profiles: true } as never)).toBe(false);
  });
});
